-- Integration test. Always roll back; no test reports or decisions are retained.
begin;
select set_config('test.report_id',gen_random_uuid()::text,true);
select set_config('request.jwt.claim.sub',(
  select cu.profile_id::text from mobile.contractor_users cu
  join erp.contracts c on c.contractor_id=cu.contractor_id
  join erp.contract_assignments a on a.contract_id=c.id
  where a.id='9d63d777-30b6-4922-96c1-d9bb4f05323e' and cu.status='APPROVED' limit 1
),true);
set local role authenticated;
insert into mobile.reports(id,assignment_id,reported_by,reported_quantity,resource_usage,comment)
values(current_setting('test.report_id')::uuid,'9d63d777-30b6-4922-96c1-d9bb4f05323e',auth.uid(),20,
 '[{"resource_id":"7203174c-ed70-4ea2-8540-4895405195b2","name":"Бумага","norm":3,"reported_quantity":60}]',
 'Transactional bridge test');
update mobile.reports set reported_quantity=21 where id=current_setting('test.report_id')::uuid;
reset role;
do $$ declare f erp.est_operational_facts; begin
  if (select count(*) from erp.est_operational_facts where mobile_report_id=current_setting('test.report_id')::uuid)<>1 then
    raise exception 'Duplicate or missing ERP card'; end if;
  select * into f from erp.est_operational_facts where mobile_report_id=current_setting('test.report_id')::uuid;
  if f.status<>'pending_approval' or f.reported_volume<>21 or f.doc_work_id is null or f.project_id is null
    or f.object_id is null or f.contract_id is null or f.resource_usage->0->>'reported_quantity'<>'60'
    or f.mobile_comment<>'Transactional bridge test' then raise exception 'Incorrect report mapping'; end if;
  if has_function_privilege('authenticated','mobile.bridge_report_to_operfact()','EXECUTE') then
    raise exception 'Trigger function exposed'; end if;
end $$;
-- Only tests decision feedback, without approving work or changing estimate totals.
update erp.est_operational_facts set status='rejected'
 where mobile_report_id=current_setting('test.report_id')::uuid;
set local role authenticated;
update mobile.reports set status='PENDING' where id=current_setting('test.report_id')::uuid;
do $$ begin
  if (select status from mobile.reports where id=current_setting('test.report_id')::uuid)<>'REJECTED' then
    raise exception 'ERP decision overwritten'; end if;
  begin
    update mobile.reports set reported_quantity=22 where id=current_setting('test.report_id')::uuid;
    raise exception 'Decided report was mutable';
  exception when sqlstate '22023' then null; end;
end $$;
reset role;
select 'PASS: authenticated insert, update without duplicates, resources, context, decision feedback, decided-report protection' as result;
rollback;
