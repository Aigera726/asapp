-- Confirm a quantity in [0, reported_volume]. Preserve the original resource report.
-- Accepted cost follows the accepted proportion of the submitted resource cost.
begin;
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
 accepted=COALESCE(p_confirmed_volume,f.reported_volume);
 IF p_action='approve' AND (accepted IS NULL OR accepted<0 OR accepted>f.reported_volume OR accepted::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Некорректный объём' USING ERRCODE='22023'; END IF;
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
     remaining_volume=COALESCE(w.volume,0)-total,amount=case when accepted=0 then 0 else round(erp.operfact_resource_amount(w.id,f.reported_volume,f.resource_usage)*accepted/nullif(f.reported_volume,0),2) end,updated_at=now() WHERE id=p_fact_id RETURNING * INTO f;
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

notify pgrst,'reload schema';
commit;
