-- Display-only translations for work assignments already visible to the signed-in user.
-- Apply manually as the owner of mobile.v_assignments (normally postgres).
-- No document, price, quantity, role or existing view is changed.
-- This is a privileged, filtered view, like the existing mobile views: callers
-- get no direct rights on ERP dictionaries. Keep both the auth check and the
-- join to the existing access-filtered assignment views.
begin;

create or replace view mobile.v_assignment_localizations
with (security_barrier = true) as
with allowed as materialized (
  select a.id, a.est_doc_work_id, a.est_doc_resource_id
  from mobile.v_assignments a
  where auth.uid() is not null
), targets as (
  select a.id::text || ':work' as id, a.id as assignment_id,
    w.id as entity_id, 'work'::text as entity_kind, w.work_id as catalogue_id,
    case when j.id is not null then 'jobs' when jc.id is not null then 'jobs_cas' end as catalogue,
    coalesce(j.measure_id, jc.measure_id) as measure_id
  from allowed a
  left join erp.est_doc_resources assigned_resource on assigned_resource.id = a.est_doc_resource_id
  join erp.est_doc_works w on w.id = coalesce(a.est_doc_work_id, assigned_resource.work_id)
  left join erp.jobs j on j.id = w.work_id
  left join erp.jobs_cas jc on jc.id = w.work_id
  union all
  select a.id::text || ':resource:' || r.id::text, a.id,
    r.id, 'resource'::text, r.resource_id,
    case when ge.id is not null then 'resources'
      when mat.id is not null then 'Materials_cas'
      when mach.id is not null then 'Machine_cas'
      when lab.id is not null then 'Labor_cas' end,
    coalesce(ge.measure_id, mat.measure_id, mach.measure_id, lab.measure_id)
  from allowed a
  join mobile.v_assignment_resources r on r.assignment_id = a.id
  left join erp.resources ge on ge.id = r.resource_id
  left join erp."Materials_cas" mat on mat.id = r.resource_id
  left join erp."Machine_cas" mach on mach.id = r.resource_id
  left join erp."Labor_cas" lab on lab.id = r.resource_id
)
select t.id, t.assignment_id, t.entity_id, t.entity_kind,
  coalesce((
    select jsonb_object_agg(l.locale, l.name) from (
      select distinct on (loc.locale) loc.locale, loc.name
      from erp.localization loc
      where loc.object_id = t.catalogue_id and loc.object_name = t.catalogue
        and loc.locale in ('ru','en','ka','az') and nullif(btrim(loc.name), '') is not null
      order by loc.locale, loc.id desc
    ) l
  ), '{}'::jsonb) as names,
  coalesce((
    select jsonb_object_agg(l.locale, l.name) from (
      select distinct on (loc.locale) loc.locale, loc.name
      from erp.localization loc
      where loc.object_id = t.measure_id and loc.object_name = 'dic_measures'
        and loc.locale in ('ru','en','ka','az') and nullif(btrim(loc.name), '') is not null
      order by loc.locale, loc.id desc
    ) l
  ), '{}'::jsonb) as units
from targets t;

comment on view mobile.v_assignment_localizations is
  'Read-only RU/EN/KA/AZ dictionary names and units for the current user''s accessible assignments; no project or user names.';
revoke all on mobile.v_assignment_localizations from public, anon;
grant select on mobile.v_assignment_localizations to authenticated;
commit;
