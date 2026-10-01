-- Explicitly requested removal. Backup: .expo/deleted-demo-project-backup.json.
begin;
do $$ begin
 if not exists(select 1 from erp.projects where id='b0cf537d-1b9b-4fa9-a35b-366117dd12d6' and name='DEMO — Мобилка (Оперфакт через договор)') then raise exception 'Demo identity does not match'; end if;
 if exists(with recursive docs as (select id,project_uuid from erp.est_documents where project_uuid='b0cf537d-1b9b-4fa9-a35b-366117dd12d6' union select d.id,d.project_uuid from erp.est_documents d join docs p on d.parent_doc_id=p.id) select 1 from docs where project_uuid is distinct from 'b0cf537d-1b9b-4fa9-a35b-366117dd12d6'::uuid) then raise exception 'Other project documents depend on demo'; end if;
end $$;
delete from erp.est_documents where project_uuid='b0cf537d-1b9b-4fa9-a35b-366117dd12d6';
delete from erp.projects where id='b0cf537d-1b9b-4fa9-a35b-366117dd12d6' and name='DEMO — Мобилка (Оперфакт через договор)';
commit;
