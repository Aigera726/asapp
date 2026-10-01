-- Run after migration 14. All decisions are rolled back.
begin;
do $$ declare f erp.est_operational_facts; d erp.est_documents; actor uuid; result jsonb;
begin
 select * into strict f from erp.est_operational_facts where id='b81f2c9f-bbcf-4100-baaf-655bf95c4a5f';
 select doc.* into strict d from erp.est_documents doc join erp.est_doc_works w on w.doc_id=doc.id where w.id=f.doc_work_id;
 select id into strict actor from erp.profiles where organization_id=d.organization_id and role='admin' limit 1;
 if f.amount<>106600 then raise exception 'Incorrect resource amount'; end if;
 if exists(select 1 from jsonb_array_elements(f.resource_usage) u where nullif(u->>'unit','') is null or u->>'name' like 'Ресурс %') then raise exception 'Missing catalog labels'; end if;
 begin
 -- После 15 допустимо частичное подтверждение, но не больше отправленного.
 perform erp.decide_operational_fact(f.id,d.organization_id,actor,'approve',201);
 raise exception 'Volume above reported was accepted';
 exception when sqlstate '22023' then null; end;
 result=erp.decide_operational_fact(f.id,d.organization_id,actor,'approve',200);
 if (result->>'remaining_volume')::numeric<>45 or (result->>'amount')::numeric<>106600 then raise exception 'Incorrect approval totals'; end if;
 if (select status from mobile.reports where id=f.mobile_report_id)<>'APPROVED' then raise exception 'Missing mobile decision'; end if;
 perform erp.decide_operational_fact(f.id,d.organization_id,actor,'approve',200);
 if (select fact_volume from erp.est_doc_works where id=f.doc_work_id)<>200 then raise exception 'Non-idempotent decision'; end if;
 begin
 perform erp.decide_operational_fact('7b700b39-d0a7-473e-a36b-443fb58d1771',d.organization_id,actor,'approve',200);
 raise exception 'Exceeded remaining volume was accepted';
 exception when sqlstate '22023' then null; end;
end $$;
select 'PASS: resource amount, labels, immutable confirmation, remaining 45, mobile feedback, idempotency, overrun blocked' result;
rollback;
