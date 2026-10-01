begin;
create or replace function erp.operfact_resource_amount(p_work_id uuid,p_qty numeric,p_usage jsonb)
returns numeric language sql stable set search_path=pg_catalog,erp as $$
 select round(case when count(r.id)>0 then sum(
 coalesce((select (u->>'reported_quantity')::numeric from jsonb_array_elements(coalesce(p_usage,'[]'::jsonb)) u
 where u->>'resource_id'=r.id::text limit 1),coalesce(r.fact_norm,r.norm,0)*p_qty)
 *coalesce(r.fact_price,r.price,0)) else coalesce(max(w.price),0)*p_qty end,2)
 from erp.est_doc_works w left join erp.est_doc_resources r on r.work_id=w.id and not coalesce(r.is_excluded,false)
 where w.id=p_work_id;
$$;
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
    when lab.id  is not null or meas.code = 'MAN_HOUR' then 'LABOR'
    else 'UNKNOWN'
  end as resource_kind,
  coalesce(lmat.name, lmach.name, llab.name, lres.name,
           'Ресурс ' || left(r.resource_id::text, 8)) as resource_name,
  coalesce(mat.code, mach.code, lab.code, res.code) as resource_code,
  coalesce(meas.code, '')                 as unit_code,
  lmeas.name                              as unit_name
from erp.est_doc_resources r
join erp.contract_assignments ca on ca.est_doc_work_id = r.work_id
  or ca.est_doc_resource_id = r.id
join erp.contracts c on c.id = ca.contract_id
join erp.est_documents d on d.id = r.doc_id

left join erp."Materials_cas" mat  on mat.id  = r.resource_id
left join erp."Machine_cas"   mach on mach.id = r.resource_id
left join erp."Labor_cas"     lab  on lab.id  = r.resource_id

left join erp.resources res on res.id = r.resource_id
left join erp.localization lres on lres.object_name = 'resources' and lres.object_id = res.id and lres.locale = 'ru'
left join erp.localization lmat
       on lmat.object_name = 'Materials_cas' and lmat.object_id = mat.id  and lmat.locale = 'ru'
left join erp.localization lmach
       on lmach.object_name = 'Machine_cas'  and lmach.object_id = mach.id and lmach.locale = 'ru'
left join erp.localization llab
       on llab.object_name = 'Labor_cas'     and llab.object_id = lab.id   and llab.locale = 'ru'

left join erp.dic_measures meas
       on meas.id = coalesce(mat.measure_id, mach.measure_id, lab.measure_id, res.measure_id)
left join erp.localization lmeas
       on lmeas.object_name = 'dic_measures' and lmeas.object_id = meas.id and lmeas.locale = 'ru'

where c.contractor_id in (select mobile.my_contractor_ids())
  and c.status = 'APPROVED'
  and d.estimate_type = 'actual'
  and coalesce(r.is_excluded, false) = false;

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
CREATE OR REPLACE FUNCTION erp.decide_operational_fact(p_fact_id uuid, p_organization_id uuid, p_actor_id uuid, p_action text, p_confirmed_volume numeric DEFAULT NULL::numeric, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'erp', 'pg_temp'
AS $function$
DECLARE f erp.est_operational_facts; original_fact jsonb; w erp.est_doc_works;
 d erp.est_documents; actor_role text; total numeric; accepted numeric;
BEGIN
 IF p_action NOT IN ('approve','reject') OR p_action IS NULL THEN RAISE EXCEPTION 'Некорректное решение' USING ERRCODE='22023'; END IF;
 SELECT role INTO actor_role FROM erp.profiles WHERE id=p_actor_id AND organization_id=p_organization_id;
 IF actor_role IS NULL OR actor_role NOT IN ('admin','manager','estimator') THEN RAISE EXCEPTION 'Недостаточно прав' USING ERRCODE='42501'; END IF;
 SELECT * INTO f FROM erp.est_operational_facts WHERE id=p_fact_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Оперативный факт не найден' USING ERRCODE='P0002'; END IF;
 -- Lock in the same document → work order as the estimate writer.
 SELECT doc.* INTO d FROM erp.est_documents doc JOIN erp.est_doc_works work ON work.doc_id=doc.id
 WHERE work.id=f.doc_work_id AND doc.organization_id=p_organization_id FOR UPDATE OF doc;
 IF NOT FOUND THEN RAISE EXCEPTION 'Оперативный факт не найден' USING ERRCODE='P0002'; END IF;
 IF actor_role<>'admin' AND d.region_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM erp.profile_regions WHERE profile_id=p_actor_id AND region_id=d.region_id
 ) THEN RAISE EXCEPTION 'Нет доступа к региону' USING ERRCODE='42501'; END IF;
 SELECT * INTO w FROM erp.est_doc_works WHERE id=f.doc_work_id AND doc_id=d.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Работа не найдена' USING ERRCODE='P0002'; END IF;
 SELECT * INTO f FROM erp.est_operational_facts WHERE id=p_fact_id FOR UPDATE;
 IF f.doc_work_id<>w.id OR f.project_id IS DISTINCT FROM d.project_uuid OR f.object_id IS DISTINCT FROM d.object_id THEN
   RAISE EXCEPTION 'Факт и работа относятся к разным объектам' USING ERRCODE='22023';
 END IF;
 IF p_action='approve' AND p_confirmed_volume IS NOT NULL AND p_confirmed_volume IS DISTINCT FROM f.reported_volume THEN
 RAISE EXCEPTION 'Подтверждается весь отправленный объём. Для исправления отклоните отчёт.' USING ERRCODE='22023'; END IF;
 accepted=f.reported_volume;
 IF p_action='approve' AND (accepted IS NULL OR accepted<0 OR accepted::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Некорректный объём' USING ERRCODE='22023'; END IF;
 IF p_action='reject' AND NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Укажите причину отклонения' USING ERRCODE='22023'; END IF;
 -- Retrying the same decision after a lost response must not duplicate audit or volume.
 IF (p_action='approve' AND f.status='approved' AND f.confirmed_volume=accepted)
 OR (p_action='reject' AND f.status='rejected' AND f.rejection_reason=btrim(p_reason)) THEN RETURN to_jsonb(f); END IF;
 IF f.status<>'pending_approval' THEN RAISE EXCEPTION 'Решение уже принято. Обновите данные.' USING ERRCODE='40001'; END IF;
 IF d.estimate_type IS DISTINCT FROM 'actual' OR d.status IS DISTINCT FROM 'actual_formed' THEN RAISE EXCEPTION 'Фактическая смета недоступна для изменения' USING ERRCODE='42501'; END IF;
 original_fact=to_jsonb(f);
 IF p_action='approve' THEN
   IF f.executor_type='counterparty' AND NOT EXISTS(
     SELECT 1 FROM erp.contract_assignments a JOIN erp.contracts c ON c.id=a.contract_id
     WHERE a.est_doc_work_id=w.id AND a.contract_id=f.contract_id AND c.contractor_id=f.contractor_id
       AND c.project_id=d.project_uuid AND a.status IS DISTINCT FROM 'CANCELLED'
       AND (f.assignment_id IS NULL OR a.id=f.assignment_id)
   ) THEN RAISE EXCEPTION 'Работа не закреплена за исполнителем по этому договору' USING ERRCODE='22023'; END IF;
   SELECT COALESCE(sum(confirmed_volume),0) INTO total FROM erp.est_operational_facts WHERE doc_work_id=w.id AND status='approved';
   IF total+accepted>COALESCE(w.volume,0) THEN RAISE EXCEPTION 'Подтверждённый объём превышает плановый' USING ERRCODE='22023'; END IF;
   total=total+accepted;
   UPDATE erp.est_operational_facts SET status='approved',confirmed_volume=accepted,confirmed_at=now(),confirmed_by=p_actor_id,
     remaining_volume=COALESCE(w.volume,0)-total,amount=erp.operfact_resource_amount(w.id,accepted,f.resource_usage),updated_at=now() WHERE id=p_fact_id RETURNING * INTO f;
   UPDATE erp.est_doc_works SET fact_volume=total,fact_amount=(select coalesce(sum(amount),0) from erp.est_operational_facts where doc_work_id=w.id and status='approved') WHERE id=w.id;
   UPDATE erp.est_operational_facts SET remaining_volume=COALESCE(w.volume,0)-total,updated_at=now()
     WHERE doc_work_id=w.id AND status<>'approved';
 ELSE
   UPDATE erp.est_operational_facts SET status='rejected',rejection_reason=btrim(p_reason),confirmed_by=p_actor_id,
     confirmed_at=now(),updated_at=now() WHERE id=p_fact_id RETURNING * INTO f;
 END IF;
 INSERT INTO erp.est_operational_fact_revisions(fact_id,actor_id,action,before_state,after_state)
 VALUES(f.id,p_actor_id,p_action,original_fact,to_jsonb(f));
 RETURN to_jsonb(f);
END; $function$
;
-- Repair only labels in pending snapshots; preserve submitted quantities.
update erp.est_operational_facts f set resource_usage=(
 select jsonb_agg(u || jsonb_build_object('name',coalesce(l.name,u->>'name'),
 'unit',coalesce(lm.name,m.code,nullif(u->>'unit',''),''),
 'kind',case when m.code='MAN_HOUR' then 'LABOR' else coalesce(u->>'kind','UNKNOWN') end))
 from jsonb_array_elements(f.resource_usage) u
 left join erp.est_doc_resources r on r.id::text=u->>'resource_id' and r.work_id=f.doc_work_id
 left join erp.resources res on res.id=r.resource_id
 left join erp.localization l on l.object_id=res.id and l.object_name='resources' and l.locale='ru'
 left join erp.dic_measures m on m.id=res.measure_id
 left join erp.localization lm on lm.object_id=m.id and lm.object_name='dic_measures' and lm.locale='ru'
) where status='pending_approval' and jsonb_array_length(resource_usage)>0;
update mobile.reports r set resource_usage=f.resource_usage from erp.est_operational_facts f
 where f.mobile_report_id=r.id and f.status='pending_approval' and r.resource_usage is distinct from f.resource_usage;
update erp.est_operational_facts set amount=erp.operfact_resource_amount(doc_work_id,reported_volume,resource_usage)
 where status='pending_approval' and mobile_report_id is not null;
notify pgrst,'reload schema';
commit;
