begin;

alter table erp.est_operational_facts
  add column if not exists mobile_report_id uuid,
  add column if not exists resource_usage jsonb,
  add column if not exists mobile_comment text;
create unique index if not exists est_operational_facts_mobile_report_unique
  on erp.est_operational_facts(mobile_report_id) where mobile_report_id is not null;

-- Runs in the same transaction as the mobile report. Existing contractor RLS
-- still checks the report write; a failure rolls back both records.
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
  select coalesce(sum(confirmed_volume),0) into confirmed from erp.est_operational_facts
    where doc_work_id=w.id and status='approved';

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
      coalesce(unit_label,a.work_unit),new.reported_quantity*coalesce(w.price,0),w.volume,w.volume-confirmed,
      (new.created_at at time zone 'UTC')::date,new.created_at,
      case when new.photo_uri is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('url',new.photo_uri)) end,
      case when cardinality(errors)=0 then 'pending_approval' else 'matching_error' end,
      nullif(array_to_string(errors,'; '),''),new.resource_usage,new.comment
    );
  else
    -- A resubmission updates the pending card, never creates another one.
    update erp.est_operational_facts set mobile_report_id=new.id,
      reported_volume=new.reported_quantity,amount=new.reported_quantity*coalesce(w.price,0),
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
revoke all on function mobile.bridge_report_to_operfact() from public, anon, authenticated;
drop trigger if exists bridge_report_to_operfact on mobile.reports;
create trigger bridge_report_to_operfact before insert or update on mobile.reports
for each row execute function mobile.bridge_report_to_operfact();

-- ERP decisions return to the mobile report. The forward trigger recognizes
-- the same content/status and cannot create a duplicate or auto-approve work.
create or replace function mobile.bridge_operfact_decision()
returns trigger language plpgsql security definer
set search_path = pg_catalog, mobile, erp
as $$
begin
  if new.mobile_report_id is not null and new.status is distinct from old.status then
    update mobile.reports set status=case new.status when 'approved' then 'APPROVED'
      when 'rejected' then 'REJECTED' else 'PENDING' end
      where id=new.mobile_report_id and status is distinct from
        case new.status when 'approved' then 'APPROVED' when 'rejected' then 'REJECTED' else 'PENDING' end;
  end if;
  return new;
end;
$$;
revoke all on function mobile.bridge_operfact_decision() from public, anon, authenticated;
drop trigger if exists bridge_operfact_decision on erp.est_operational_facts;
create trigger bridge_operfact_decision after update of status on erp.est_operational_facts
for each row execute function mobile.bridge_operfact_decision();

-- Backfill existing reports, preserving their content and creation time.
update mobile.reports set status=status;
notify pgrst,'reload schema';
commit;
