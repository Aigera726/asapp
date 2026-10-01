-- Apply after 15 as the owner of mobile views (postgres).
-- Остаток объёма работы для мобилки:
--   доступно = план − подтверждено − на подтверждении.
-- Подтверждённым считается confirmed_volume (частичное подтверждение
-- возвращает неподтверждённую часть в доступное), на подтверждении —
-- reported_volume карточек pending_approval. Отклонённые и matching_error
-- объём не резервируют.
begin;

-- ── 1. Сводка объёмов в витрине заданий ────────────────────────────────────
-- Определение 11 сохранено без изменений; новые колонки добавлены в конец.

create or replace view mobile.v_assignments as
select
  ca.id,
  ca.contract_id,
  ca.assignment_type,
  ca.est_doc_work_id,
  ca.est_doc_resource_id,
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
  c.contractor_id,
  c.object_id,
  c.project_id,
  c.contract_number,
  c.contract_name,
  c.status as contract_status,
  ct.company_name as contractor_name,
  w.volume as estimate_volume,
  d.id as estimate_doc_id,
  d.estimate_type,
  coalesce(w.fact_volume, w.volume) as actual_volume,
  -- Объёмы по всей работе, от всех исполнителей: остаток общий.
  vol.work_confirmed_volume,
  vol.work_pending_volume,
  -- Объёмы по этому назначению договора: предел организации-подрядчика.
  vol.assignment_confirmed_volume,
  vol.assignment_pending_volume
from erp.contract_assignments ca
join erp.contracts   c  on c.id  = ca.contract_id
left join erp.contractors ct on ct.id = c.contractor_id
left join erp.est_doc_resources ar on ar.id = ca.est_doc_resource_id
left join erp.est_doc_works w on w.id = coalesce(ca.est_doc_work_id, ar.work_id)
join erp.est_documents d on d.id = coalesce(w.doc_id, ar.doc_id)
left join erp.jobs_cas      j on j.id = w.work_id
left join erp.localization lw
       on lw.object_name = 'jobs_cas' and lw.object_id = j.id and lw.locale = 'ru'
left join erp.dic_measures  mw on mw.id = j.measure_id
left join lateral (
  select
    coalesce(sum(f.confirmed_volume) filter (where f.status = 'approved'), 0)         as work_confirmed_volume,
    coalesce(sum(f.reported_volume)  filter (where f.status = 'pending_approval'), 0) as work_pending_volume,
    coalesce(sum(f.confirmed_volume) filter (where f.status = 'approved'
                                               and f.assignment_id = ca.id), 0)       as assignment_confirmed_volume,
    coalesce(sum(f.reported_volume)  filter (where f.status = 'pending_approval'
                                               and f.assignment_id = ca.id), 0)       as assignment_pending_volume
  from erp.est_operational_facts f
  where f.doc_work_id = w.id
) vol on true
where c.contractor_id in (select mobile.my_contractor_ids())
  and c.status = 'APPROVED'
  and d.estimate_type = 'actual';

comment on view mobile.v_assignments is
  'Работы договоров текущего пользователя. Точка входа мобилки: всё остальное '
  'подтягивается от этих строк. work_*_volume — подтверждённый и ожидающий '
  'объём по работе от всех исполнителей, assignment_*_volume — по назначению.';

-- ── 2. История отправок по работе ──────────────────────────────────────────
-- Все отчёты по назначениям организации пользователя, от всех её сотрудников.
-- Чужие организации не видны: договор принадлежит своему подрядчику.

create or replace view mobile.v_work_reports as
select
  f.id,
  f.mobile_report_id,
  f.assignment_id,
  f.doc_work_id,
  f.reported_volume,
  f.confirmed_volume,
  f.unit,
  f.status,
  f.executor_name,
  coalesce(f.formed_at, f.created_at) as reported_at,
  f.confirmed_at as decided_at,
  nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') as decided_by_name,
  f.rejection_reason,
  f.matching_error_details
from erp.est_operational_facts f
left join erp.profiles p on p.id = f.confirmed_by
where f.assignment_id in (select mobile.my_assignment_ids());

comment on view mobile.v_work_reports is
  'Отправленные объёмы по работам организации: кто, когда, статус ERP, '
  'подтверждённый объём и причина отклонения.';

grant select on mobile.v_assignments, mobile.v_work_reports to authenticated;

-- ── 3. Проверка остатка при приёме отчёта ──────────────────────────────────
-- Тело 14 без изменений, кроме блока «Остаток объёма». Блокировка по работе
-- упорядочивает одновременные отправки; решение ERP остаток только
-- увеличивает, поэтому с decide_operational_fact её делить не нужно.

create or replace function mobile.bridge_report_to_operfact()
returns trigger language plpgsql security definer
set search_path = pg_catalog, mobile, erp
as $$
declare
  a erp.contract_assignments; c erp.contracts; w erp.est_doc_works;
  d erp.est_documents; f erp.est_operational_facts;
  errors text[] := '{}'; work_label text; unit_label text; executor_label text;
  company_label text; project_label text; object_label text;
  confirmed numeric := 0; existing_count integer; content_changed boolean := true;
  pending numeric := 0; available numeric; assignment_limit numeric;
  assignment_confirmed numeric := 0; assignment_pending numeric := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('mobile-report:' || new.id::text, 0));
  if new.reported_quantity <= 0 or new.reported_quantity::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Некорректный объём отчёта' using errcode='22023';
  end if;
  if new.resource_usage is not null and jsonb_typeof(new.resource_usage) <> 'array' then
    raise exception 'Ресурсы отчёта должны быть массивом' using errcode='22023';
  end if;
  if tg_op = 'UPDATE' then
    content_changed := (new.assignment_id,new.reported_quantity,new.reported_by,new.comment,new.photo_uri,new.resource_usage)
      is distinct from (old.assignment_id,old.reported_quantity,old.reported_by,old.comment,old.photo_uri,old.resource_usage);
  end if;
  select count(*) into existing_count from erp.est_operational_facts
    where mobile_report_id=new.id or external_id=new.id::text;
  if existing_count > 1 then
    raise exception 'Несколько оперфактов для отчёта %: требуется сверка',new.id;
  end if;
  select * into f from erp.est_operational_facts
    where mobile_report_id=new.id or external_id=new.id::text for update;
  if found then
    if f.assignment_id is distinct from new.assignment_id then
      raise exception 'Нельзя заменить работу в уже отправленном отчёте' using errcode='22023';
    end if;
    if f.status in ('approved','rejected') and content_changed and tg_op='UPDATE' then
      raise exception 'По отчёту уже принято решение в ERP. Изменение объёма недоступно.' using errcode='22023';
    end if;
    if not content_changed or f.status in ('approved','rejected') then
      update erp.est_operational_facts set mobile_report_id=new.id,
        resource_usage=coalesce(resource_usage,new.resource_usage),
        mobile_comment=coalesce(mobile_comment,new.comment)
        where id=f.id;
      new.status := case f.status when 'approved' then 'APPROVED' when 'rejected' then 'REJECTED' else 'PENDING' end;
      return new;
    end if;
  end if;

  select * into a from erp.contract_assignments where id=new.assignment_id;
  if a.id is null then errors:=array_append(errors,'Назначение не найдено'); end if;
  select * into c from erp.contracts where id=a.contract_id;
  if c.id is null then errors:=array_append(errors,'Договор не найден');
  elsif c.status is distinct from 'APPROVED' then errors:=array_append(errors,'Договор не согласован'); end if;
  select * into w from erp.est_doc_works where id=a.est_doc_work_id;
  select * into d from erp.est_documents where id=w.doc_id;
  if w.id is null or d.estimate_type is distinct from 'actual' then
    errors:=array_append(errors,'Работа не относится к фактической смете');
    w.id:=null;
  elsif c.project_id is distinct from d.project_uuid or c.object_id is distinct from d.object_id then
    errors:=array_append(errors,'Договор и работа относятся к разным проектам или объектам');
  end if;
  if a.status='CANCELLED' then errors:=array_append(errors,'Назначение отменено'); end if;

  select name into project_label from erp.projects where id=c.project_id;
  select name into object_label from erp.project_objects where id=c.object_id;
  select company_name into company_label from erp.contractors where id=c.contractor_id;
  select nullif(trim(concat_ws(' ', first_name,last_name)),'') into executor_label
    from erp.profiles where id=new.reported_by;
  select name into work_label from erp.localization
    where object_id=w.work_id and object_name in ('jobs_cas','jobs') and locale='ru' limit 1;
  select coalesce(l.name,m.code) into unit_label from erp.dic_measures m
    left join erp.localization l on l.object_id=m.id and l.object_name='dic_measures' and l.locale='ru'
    where m.id=coalesce((select measure_id from erp.jobs_cas where id=w.work_id),
                       (select measure_id from erp.jobs where id=w.work_id)) limit 1;

  -- ── Остаток объёма ──
  if cardinality(errors)=0 then
    perform pg_advisory_xact_lock(hashtextextended('work-volume:' || w.id::text, 0));
    select coalesce(sum(confirmed_volume) filter (where status='approved'),0),
           coalesce(sum(reported_volume) filter (where status='pending_approval' and id is distinct from f.id),0),
           coalesce(sum(confirmed_volume) filter (where status='approved' and assignment_id=a.id),0),
           coalesce(sum(reported_volume) filter (where status='pending_approval' and assignment_id=a.id and id is distinct from f.id),0)
      into confirmed, pending, assignment_confirmed, assignment_pending
      from erp.est_operational_facts where doc_work_id=w.id;
    available := coalesce(w.volume,0) - confirmed - pending;
    if new.reported_quantity > available then
      raise exception 'Объём % больше доступного %: план %, подтверждено %, на подтверждении %. Обновите данные.',
        new.reported_quantity, greatest(available,0), coalesce(w.volume,0), confirmed, pending
        using errcode='22023';
    end if;
    assignment_limit := coalesce(a.assigned_quantity, a.total_quantity);
    if assignment_limit is not null
       and new.reported_quantity > assignment_limit - assignment_confirmed - assignment_pending then
      raise exception 'Объём % больше доступного по договору %: назначено %, подтверждено %, на подтверждении %. Обновите данные.',
        new.reported_quantity, greatest(assignment_limit - assignment_confirmed - assignment_pending,0),
        assignment_limit, assignment_confirmed, assignment_pending
        using errcode='22023';
    end if;
  else
    select coalesce(sum(confirmed_volume),0) into confirmed from erp.est_operational_facts
      where doc_work_id=w.id and status='approved';
  end if;

  if f.id is null then
    insert into erp.est_operational_facts (
      mobile_report_id,external_id,assignment_id,project_id,project_name,object_id,object_name,
      contract_id,contract_number,contractor_id,doc_work_id,work_name,executor_type,
      department_or_contractor,executor_name,reported_volume,unit,amount,plan_volume,remaining_volume,
      execution_date,formed_at,documents,status,matching_error_details,resource_usage,mobile_comment
    ) values (
      new.id,new.id::text,a.id,c.project_id,project_label,c.object_id,object_label,
      c.id,c.contract_number,c.contractor_id,w.id,coalesce(work_label,a.work_name),'counterparty',
      company_label,coalesce(executor_label,'Исполнитель мобильного приложения'),new.reported_quantity,
      coalesce(unit_label,a.work_unit),erp.operfact_resource_amount(w.id,new.reported_quantity,new.resource_usage),w.volume,w.volume-confirmed,
      (new.created_at at time zone 'UTC')::date,new.created_at,
      case when new.photo_uri is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('url',new.photo_uri)) end,
      case when cardinality(errors)=0 then 'pending_approval' else 'matching_error' end,
      nullif(array_to_string(errors,'; '),''),new.resource_usage,new.comment
    );
  else
    -- A resubmission updates the pending card, never creates another one.
    update erp.est_operational_facts set mobile_report_id=new.id,
      reported_volume=new.reported_quantity,amount=erp.operfact_resource_amount(w.id,new.reported_quantity,new.resource_usage),
      resource_usage=new.resource_usage,mobile_comment=new.comment,
      documents=case when new.photo_uri is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('url',new.photo_uri)) end,
      status=case when cardinality(errors)=0 then 'pending_approval' else 'matching_error' end,
      matching_error_details=nullif(array_to_string(errors,'; '),''),updated_at=now()
      where id=f.id;
  end if;
  new.status:='PENDING';
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
