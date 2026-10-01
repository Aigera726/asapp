begin;
do $$ declare f erp.est_operational_facts; d erp.est_documents; actor uuid; q numeric; result jsonb; before_total numeric; original_amount numeric;
begin
 select x.* into strict f from erp.est_operational_facts x join erp.est_doc_works w on w.id=x.doc_work_id where x.status='pending_approval' and x.reported_volume>0 and x.reported_volume<=w.volume-coalesce((select sum(confirmed_volume) from erp.est_operational_facts y where y.doc_work_id=w.id and y.status='approved'),0) order by x.formed_at desc limit 1;
 select doc.* into strict d from erp.est_documents doc join erp.est_doc_works w on w.doc_id=doc.id where w.id=f.doc_work_id;
 select id into strict actor from erp.profiles where organization_id=d.organization_id and role='admin' limit 1;
 select coalesce(sum(confirmed_volume),0) into before_total from erp.est_operational_facts where doc_work_id=f.doc_work_id and status='approved';
 original_amount=erp.operfact_resource_amount(f.doc_work_id,f.reported_volume,f.resource_usage);
 foreach q in array array[-1::numeric,f.reported_volume+1,'NaN'::numeric] loop
 begin
 perform erp.decide_operational_fact(f.id,d.organization_id,actor,'approve',q);
 raise exception 'Invalid quantity accepted: %',q;
 exception when sqlstate '22023' then null; end;
 end loop;
 foreach q in array array[0::numeric,f.reported_volume/2,f.reported_volume] loop
 begin
 result=erp.decide_operational_fact(f.id,d.organization_id,actor,'approve',q);
 if (result->>'confirmed_volume')::numeric<>q or (result->>'amount')::numeric<>round(original_amount*q/f.reported_volume,2) then raise exception 'Incorrect accepted quantity or cost'; end if;
 if (select fact_volume from erp.est_doc_works where id=f.doc_work_id)<>before_total+q then raise exception 'Incorrect work total'; end if;
 if result->'resource_usage' is distinct from to_jsonb(f)->'resource_usage' then raise exception 'Original report changed'; end if;
 perform erp.decide_operational_fact(f.id,d.organization_id,actor,'approve',q);
 raise exception using errcode='ZX001',message='Rollback successful test case';
 exception when sqlstate 'ZX001' then null; end;
 end loop;
end $$;
select 'PASS: negative, above max and NaN rejected; zero, partial and full accepted; proportional cost; original report preserved; idempotent retry' result;
rollback;
