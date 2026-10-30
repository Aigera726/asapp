-- Apply after 16 as the owner of mobile views (postgres). НЕ применено: база мобилки — PROD.
-- Остаток материалов работы для формы отчёта (задача «Нормы расхода», 2026-10-30):
--   остаток = количество по фактической смете − уже списано,
--   уже списано = подтверждённые факты (строка документа расхода, иначе количество
--   из отчёта на подтверждённый объём, иначе норма × подтверждённый объём)
--   + факты на подтверждении (количество из отчёта, иначе норма × заявленный объём).
-- Те же правила проверяет УСП при поступлении и подтверждении факта
-- (module-estimates/server/services/material-limit.cjs).
-- Материалом считается ресурс из «Materials_cas» (AZ) или справочника resources
-- с типом 10.130.* (GE): в v_assignment_resources грузинские материалы
-- определяются как UNKNOWN. УСП выбирает справочник по стране сметы; id ресурсов
-- в двух справочниках не пересекаются, поэтому результат тот же.
-- Отрицательное количество в отчёте считается как 0 (как в документе расхода).
begin;

create or replace view mobile.v_material_usage as
with my_works as (
  -- Работа закреплена целиком или строкой ресурса (как в v_assignment_resources).
  select distinct coalesce(ca.est_doc_work_id, ar.work_id) as work_id
  from erp.contract_assignments ca
  join erp.contracts c on c.id = ca.contract_id
  left join erp.est_doc_resources ar on ar.id = ca.est_doc_resource_id
  where c.contractor_id in (select mobile.my_contractor_ids())
    and c.status = 'APPROVED'
    and coalesce(ca.est_doc_work_id, ar.work_id) is not null
),
materials as (
  select r.id, r.work_id,
         coalesce(r.fact_quantity, r.quantity, 0) as estimate_quantity,
         coalesce(nullif(r.fact_norm, 0), nullif(r.norm, 0),
                  case when w.volume > 0 then coalesce(r.fact_quantity, r.quantity, 0) / w.volume end, 0) as norm
  from erp.est_doc_resources r
  join my_works mw on mw.work_id = r.work_id
  join erp.est_doc_works w on w.id = r.work_id
  join erp.est_documents d on d.id = r.doc_id and d.estimate_type = 'actual'
  left join erp."Materials_cas" mat on mat.id = r.resource_id
  left join erp.resources res on res.id = r.resource_id
  left join erp.dic_resource_types rt on rt.id = res.type_id
  where coalesce(r.is_excluded, false) = false
    and (mat.id is not null or rt.code like '10.130.%')
),
per_fact as (
  select m.id, m.work_id, m.estimate_quantity,
         greatest(case
           when f.id is null then 0
           when f.status = 'approved' and l.fact_quantity is not null then l.fact_quantity
           when u.q is not null and f.reported_volume > 0 then
             u.q * (case when f.status = 'approved' then f.confirmed_volume else f.reported_volume end) / f.reported_volume
           else m.norm * (case when f.status = 'approved' then f.confirmed_volume else f.reported_volume end)
         end, 0) as used
  from materials m
  left join erp.est_operational_facts f
         on f.doc_work_id = m.work_id and f.status in ('approved', 'pending_approval')
  left join lateral (
    select case when coalesce(x->>'reported_quantity', x->>'calculated_quantity') ~ '^-?[0-9]+([.][0-9]+)?$'
                then coalesce(x->>'reported_quantity', x->>'calculated_quantity')::numeric end as q
    from jsonb_array_elements(case when jsonb_typeof(f.resource_usage) = 'array' then f.resource_usage else '[]'::jsonb end) x
    where x->>'resource_id' = m.id::text
    limit 1
  ) u on true
  left join erp.est_material_consumptions mc on mc.operational_fact_id = f.id
  left join erp.est_material_consumption_lines l on l.consumption_id = mc.id and l.est_doc_resource_id = m.id
)
select id as est_doc_resource_id, work_id, estimate_quantity, coalesce(sum(used), 0) as used_quantity
from per_fact
group by id, work_id, estimate_quantity;

grant select on mobile.v_material_usage to authenticated;
notify pgrst, 'reload schema';
commit;
