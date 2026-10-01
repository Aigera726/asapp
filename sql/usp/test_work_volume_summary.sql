-- Run after migration 16. Everything is rolled back.
-- Scenario: plan 245 → send 200 → available 45 → second report of 46 refused →
-- approve 120 of 200 → available 125 → reject instead → available 245.
begin;
do $$
declare
  a erp.contract_assignments; w erp.est_doc_works; d erp.est_documents; actor uuid;
  r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid(); fact uuid; plan numeric;
  wc numeric; wp numeric;
begin
  -- A work of an approved contract in an actual estimate without prior facts.
  select ca.* into strict a from erp.contract_assignments ca
    join erp.contracts c on c.id=ca.contract_id
    join erp.est_doc_works x on x.id=ca.est_doc_work_id
    join erp.est_documents doc on doc.id=x.doc_id
   where c.status='APPROVED' and doc.estimate_type='actual' and doc.status='actual_formed'
     and c.project_id=doc.project_uuid and c.object_id is not distinct from doc.object_id
     and ca.status is distinct from 'CANCELLED'
     and not exists(select 1 from erp.est_operational_facts f where f.doc_work_id=x.id)
   limit 1;
  select * into strict w from erp.est_doc_works where id=a.est_doc_work_id;
  select * into strict d from erp.est_documents where id=w.doc_id;
  select id into strict actor from erp.profiles where organization_id=d.organization_id and role='admin' limit 1;

  -- Fix the numbers of the example: plan 245, contract limit not lower.
  update erp.est_doc_works set volume=245 where id=w.id;
  update erp.contract_assignments set assigned_quantity=245 where id=a.id;
  plan := 245;

  insert into mobile.reports(id,assignment_id,reported_by,reported_quantity,resource_usage)
    values (r1,a.id,actor,200,'[]');
  select id into strict fact from erp.est_operational_facts where mobile_report_id=r1;
  if (select status from erp.est_operational_facts where id=fact)<>'pending_approval' then
    raise exception 'Report not pending';
  end if;

  select coalesce(sum(confirmed_volume) filter (where status='approved'),0),
         coalesce(sum(reported_volume) filter (where status='pending_approval'),0)
    into wc, wp from erp.est_operational_facts where doc_work_id=w.id;
  if plan-wc-wp<>45 then raise exception 'Expected 45 available, got %',plan-wc-wp; end if;

  begin
    insert into mobile.reports(id,assignment_id,reported_by,reported_quantity,resource_usage)
      values (r2,a.id,actor,46,'[]');
    raise exception 'Overrun over pending volume accepted';
  exception when sqlstate '22023' then null; end;

  -- Resubmitting the same pending report is not counted against itself.
  update mobile.reports set reported_quantity=245 where id=r1;
  update mobile.reports set reported_quantity=200 where id=r1;

  begin
    perform erp.decide_operational_fact(fact,d.organization_id,actor,'approve',120);
    select coalesce(sum(confirmed_volume) filter (where status='approved'),0),
           coalesce(sum(reported_volume) filter (where status='pending_approval'),0)
      into wc, wp from erp.est_operational_facts where doc_work_id=w.id;
    if plan-wc-wp<>125 then raise exception 'Expected 125 available after partial approval, got %',plan-wc-wp; end if;
    insert into mobile.reports(id,assignment_id,reported_by,reported_quantity,resource_usage)
      values (r2,a.id,actor,125,'[]');
    raise exception using errcode='ZX001',message='rollback partial case';
  exception when sqlstate 'ZX001' then null; end;

  perform erp.decide_operational_fact(fact,d.organization_id,actor,'reject',null,'Тест');
  if (select status from mobile.reports where id=r1)<>'REJECTED' then raise exception 'Missing mobile rejection'; end if;
  insert into mobile.reports(id,assignment_id,reported_by,reported_quantity,resource_usage)
    values (r2,a.id,actor,245,'[]');
end $$;
select 'PASS: 245−200 pending = 45, overrun refused, resubmit ok, partial 120 → 125, reject → 245' result;
rollback;
