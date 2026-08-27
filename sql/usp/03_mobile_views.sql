-- ═══════════════════════════════════════════════════════════════════════════
-- Витрина для мобилки: работы договоров и ресурсы по этим работам.
--
-- ЗАЧЕМ ПРЕДСТАВЛЕНИЯ, А НЕ ПРЯМОЕ ЧТЕНИЕ erp
-- На erp.contracts / contract_assignments / contractors включена RLS команды
-- УСП. Добавлять туда свои политики — значит лезть в чужой контур и рисковать
-- их фронтендом. Представление принадлежит postgres и выполняется с его
-- правами (security_invoker НЕ включаем), поэтому RLS таблиц erp обходится,
-- а единственным фильтром становится наше собственное условие по
-- mobile.contractor_users. Область видимости задаётся здесь и только здесь.
--
-- ВАЖНО: файл должен применяться суперпользователем (postgres). Если владельцем
-- представления окажется обычная роль, RLS таблиц erp не будет обойдена и
-- прораб увидит пустой список.
--
-- ЧТО ЕДЕТ НА УСТРОЙСТВО
-- Только работы договоров текущего подрядчика и ресурсы этих работ — сотни
-- строк. Справочники (jobs_cas, Materials_cas, localization) целиком не
-- выгружаются: названия разворачиваются здесь, в базе.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Объекты, на которых у подрядчика есть договоры ──────────────────────

create or replace view mobile.v_objects as
select
  o.id,
  o.project_id,
  o.name,
  o.address,
  o.latitude,
  o.longitude,
  p.name  as project_name,
  p.code  as project_code
from erp.project_objects o
join erp.projects p on p.id = o.project_id
where o.id in (select mobile.my_object_ids());

comment on view mobile.v_objects is
  'Объекты (project_objects) с названием проекта. Соответствует паре '
  '«объект → проект» в мобилке.';

-- ── 2. Работы договоров — то, что прораб видит как задания ─────────────────

create or replace view mobile.v_assignments as
select
  ca.id,
  ca.contract_id,
  ca.assignment_type,
  ca.est_doc_work_id,
  ca.est_doc_resource_id,
  -- work_name в contract_assignments денормализован, но может быть пустым:
  -- подстраховываемся справочником работ через строку сметы.
  coalesce(nullif(ca.work_name, ''), lw.name, 'Без названия') as work_name,
  coalesce(nullif(ca.work_unit, ''), mw.code)                 as work_unit,
  ca.resource_name,
  ca.resource_unit,
  ca.resource_spec,
  ca.total_quantity,
  ca.assigned_quantity,
  ca.status,
  ca.with_materials,
  ca.notes,
  ca.created_at,
  -- Контекст договора: мобилке нужен объект и подрядчик, чтобы не тянуть
  -- contracts отдельной таблицей.
  c.contractor_id,
  c.object_id,
  c.project_id,
  c.contract_number,
  c.contract_name,
  c.status as contract_status,
  ct.company_name as contractor_name,
  -- Плановый объём работы из сметы: нужен, чтобы считать процент выполнения.
  w.volume as estimate_volume
from erp.contract_assignments ca
join erp.contracts   c  on c.id  = ca.contract_id
left join erp.contractors ct on ct.id = c.contractor_id
left join erp.est_doc_works w on w.id = ca.est_doc_work_id
left join erp.jobs_cas      j on j.id = w.work_id
left join erp.localization lw
       on lw.object_name = 'jobs_cas' and lw.object_id = j.id and lw.locale = 'ru'
left join erp.dic_measures  mw on mw.id = j.measure_id
where c.contractor_id in (select mobile.my_contractor_ids());

comment on view mobile.v_assignments is
  'Работы договоров текущего пользователя. Точка входа мобилки: всё остальное '
  'подтягивается от этих строк.';

-- ── 3. Ресурсы по работам — состав из сметы ────────────────────────────────
--
-- est_doc_resources.resource_id полиморфен: ссылается в Materials_cas,
-- Machine_cas или Labor_cas. Внешнего ключа нет, поэтому разбираем coalesce
-- по трём справочникам сразу — какой сработает, тот и даёт вид ресурса.

create or replace view mobile.v_assignment_resources as
select
  r.id,
  r.work_id,
  ca.id as assignment_id,
  r.resource_id,
  r.norm,
  r.quantity,
  r.is_excluded,
  r.fact_quantity,
  r.fact_norm,
  case
    when mat.id  is not null then 'MATERIAL'
    when mach.id is not null then 'MACHINE'
    when lab.id  is not null then 'LABOR'
    else 'UNKNOWN'
  end as resource_kind,
  coalesce(lmat.name, lmach.name, llab.name,
           'Ресурс ' || left(r.resource_id::text, 8)) as resource_name,
  coalesce(mat.code, mach.code, lab.code) as resource_code,
  coalesce(meas.code, '')                 as unit_code,
  lmeas.name                              as unit_name
from erp.est_doc_resources r
join erp.contract_assignments ca on ca.est_doc_work_id = r.work_id
join erp.contracts c on c.id = ca.contract_id

left join erp."Materials_cas" mat  on mat.id  = r.resource_id
left join erp."Machine_cas"   mach on mach.id = r.resource_id
left join erp."Labor_cas"     lab  on lab.id  = r.resource_id

left join erp.localization lmat
       on lmat.object_name = 'Materials_cas' and lmat.object_id = mat.id  and lmat.locale = 'ru'
left join erp.localization lmach
       on lmach.object_name = 'Machine_cas'  and lmach.object_id = mach.id and lmach.locale = 'ru'
left join erp.localization llab
       on llab.object_name = 'Labor_cas'     and llab.object_id = lab.id   and llab.locale = 'ru'

left join erp.dic_measures meas
       on meas.id = coalesce(mat.measure_id, mach.measure_id, lab.measure_id)
left join erp.localization lmeas
       on lmeas.object_name = 'dic_measures' and lmeas.object_id = meas.id and lmeas.locale = 'ru'

where c.contractor_id in (select mobile.my_contractor_ids())
  and coalesce(r.is_excluded, false) = false;

comment on view mobile.v_assignment_resources is
  'Состав ресурсов по работам договора: норма на единицу, количество по смете '
  'и развёрнутые названия. Справочники на устройство не выгружаются.';

-- ── Права ──────────────────────────────────────────────────────────────────
grant select on mobile.v_objects, mobile.v_assignments,
                mobile.v_assignment_resources to authenticated;
