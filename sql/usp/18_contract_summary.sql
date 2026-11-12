-- 18. Договор в мобилке: сумма, валюта и сроки договора на вкладке «Работы» — PROD, схема mobile (читает erp).
-- Выполнять владельцем представлений mobile (postgres). Данные не меняются — только представление.
-- Действующее определение mobile.v_assignments берётся из базы (последнее — EcoPro
-- module-estimates/server/migrations/20261005_boq_mobile_operfact.sql, оканчивается колонкой d.boq_source_id),
-- и после последней колонки добавляются пять новых. Фильтры и соединения остаются как есть.
-- Если определение не оканчивается на boq_source_id — ошибка, ничего не меняется. Повторный запуск ничего не делает.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $patch$
declare
  def text := pg_get_viewdef('mobile.v_assignments'::regclass, true);
  opts text[] := (select reloptions from pg_class where oid = 'mobile.v_assignments'::regclass);
  pattern text := 'd\.boq_source_id\s+FROM';
  added text := 'd.boq_source_id,
    c.total_amount AS contract_amount,
    (SELECT cur.code FROM erp.dic_currencies cur WHERE cur.id = c.currency_id) AS contract_currency,
    (SELECT cur.symbol FROM erp.dic_currencies cur WHERE cur.id = c.currency_id) AS contract_currency_symbol,
    c.date_start AS contract_date_start,
    c.date_end AS contract_date_end
   FROM';
begin
  if position('contract_amount' in def) > 0 then raise notice 'mobile.v_assignments: contract_* уже есть'; return; end if;
  if (select count(*) from regexp_matches(def, pattern, 'g')) <> 1 then
    raise exception 'mobile.v_assignments: определение не оканчивается колонкой d.boq_source_id — сообщите разработчику';
  end if;
  def := rtrim(regexp_replace(def, pattern, added), E'; \n');
  execute 'create or replace view mobile.v_assignments'
    || case when opts is null then '' else ' with (' || array_to_string(opts, ', ') || ')' end
    || ' as ' || def;
end $patch$;

comment on view mobile.v_assignments is
  'Работы договоров текущего пользователя. Точка входа мобилки: всё остальное '
  'подтягивается от этих строк. work_*_volume — подтверждённый и ожидающий '
  'объём по работе от всех исполнителей, assignment_*_volume — по назначению. '
  'contract_* — сумма, валюта и сроки договора (миграция 18).';

commit;

-- Проверка (выполнить после):
-- select contract_number, contract_amount, contract_currency_symbol, contract_date_start, contract_date_end
-- from mobile.v_assignments limit 5;
