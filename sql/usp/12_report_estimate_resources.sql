begin;
-- Snapshot of resources entered with the work report, independent of warehouse.
alter table mobile.reports add column if not exists resource_usage jsonb;
comment on column mobile.reports.resource_usage is
  'Ресурсы отчёта: UUID строки фактической сметы, вид, норма, количество по смете и в отчёте. Не складское списание.';
notify pgrst, 'reload schema';
commit;
