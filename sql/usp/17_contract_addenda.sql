-- 17. Доп. соглашения (ДС) к договорам в мобилке — PROD, схема mobile (читает erp).
-- Уведомления «ДС на согласовании / согласовано / отклонено» и разовое окно «ДС согласовано —
-- изменились объёмы». Только чтение. Видны ДС договоров своей организации (подрядчика),
-- без черновиков и удалённых. changes — изменения объёма по работам: было → стало, новые работы.
-- Требует миграций ДС 20261110_ds_01…13 (erp.contract_addenda, erp.contract_addendum_lines).
-- Повторный запуск ничего не ломает (CREATE OR REPLACE VIEW).
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace view mobile.v_contract_addenda as
select
  ad.id,
  ad.contract_id,
  c.contract_number,
  p.name as project_name,
  o.name as object_name,
  ad.number,
  ad.status,
  ad.addendum_date,
  ad.submitted_at,
  ad.decided_at,
  case when ad.status = 'REJECTED' then ad.decision_comment end as decision_comment,
  coalesce((
    select jsonb_agg(jsonb_build_object(
        'assignment_id', l.assignment_id,
        'work_name', coalesce(nullif(ca.work_name, ''), lw.name, 'Без названия'),
        'unit', coalesce(nullif(ca.work_unit, ''), lm.name),
        'change', l.volume_change,
        'added', l.assignment_id is null,
        'old_quantity', l.old_quantity,
        'new_quantity', l.new_quantity)
      order by l.assignment_id is null, coalesce(nullif(ca.work_name, ''), lw.name))
    from erp.contract_addendum_lines l
    left join erp.contract_assignments ca on ca.id = l.assignment_id
    left join erp.est_doc_works w on w.id = l.est_doc_work_id
    left join lateral (select name from erp.localization
      where object_id = w.work_id and object_name in ('jobs_cas', 'jobs') and locale = 'ru' limit 1) lw on true
    left join lateral (select coalesce(ml.name, m.code) as name from erp.dic_measures m
      left join erp.localization ml on ml.object_id = m.id and ml.object_name = 'dic_measures' and ml.locale = 'ru'
      where m.id = coalesce((select measure_id from erp.jobs_cas where id = w.work_id),
                            (select measure_id from erp.jobs where id = w.work_id)) limit 1) lm on true
    where l.addendum_id = ad.id and l.volume_change is not null
  ), '[]'::jsonb) as changes
from erp.contract_addenda ad
join erp.contracts c on c.id = ad.contract_id
left join erp.projects p on p.id = c.project_id
left join erp.project_objects o on o.id = c.object_id
where ad.deleted_at is null
  and ad.status in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')
  and c.contractor_id in (select mobile.my_contractor_ids());

comment on view mobile.v_contract_addenda is
  'ДС к договорам организации для уведомлений мобилки: номер, статус, даты, причина отклонения, '
  'изменения объёма по работам (было → стало, новые работы).';

grant select on mobile.v_contract_addenda to authenticated;

notify pgrst, 'reload schema';
commit;

-- Проверка после выполнения (только чтение): представление есть и права выданы.
-- select has_table_privilege('authenticated', 'mobile.v_contract_addenda', 'SELECT') as auth_ok,
--        has_table_privilege('anon', 'mobile.v_contract_addenda', 'SELECT') as anon_sel;  -- ожидается true, false
