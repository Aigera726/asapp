-- ═══════════════════════════════════════════════════════════════════════════
-- RLS для схемы `mobile`.
--
-- Правило одно: пользователь видит то, что относится к договорам его
-- контрагента (mobile.contractor_users). Отсюда два среза —
-- по работе договора (my_assignment_ids) и по объекту (my_object_ids).
--
-- Схему erp этот файл НЕ трогает: включение RLS на таблицах УСП может
-- сломать их фронтенд, это решение команды УСП. Пока мобилка ограничивает
-- выборку из erp на стороне клиента — фильтром в запросах синхронизации.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Права. RLS без grant не работает: политика сужает доступ, но не выдаёт его.
grant select, insert, update, delete on all tables in schema mobile to authenticated;
alter default privileges in schema mobile
  grant select, insert, update, delete on tables to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Связь пользователь ↔ контрагент: читать можно только свои строки, менять —
-- нельзя. Выдача доступа идёт из админки под service_role, иначе прораб мог бы
-- приписать себя к чужому контрагенту и увидеть все его договоры.
-- ═══════════════════════════════════════════════════════════════════════════

alter table mobile.contractor_users enable row level security;

drop policy if exists contractor_users_select_own on mobile.contractor_users;
create policy contractor_users_select_own on mobile.contractor_users
  for select to authenticated
  using (profile_id = auth.uid());

revoke insert, update, delete on mobile.contractor_users from authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Таблицы, привязанные к работе договора
-- ═══════════════════════════════════════════════════════════════════════════

alter table mobile.reports enable row level security;

drop policy if exists reports_own_assignments on mobile.reports;
create policy reports_own_assignments on mobile.reports
  for all to authenticated
  using      (assignment_id in (select mobile.my_assignment_ids()))
  with check (assignment_id in (select mobile.my_assignment_ids()));

-- ═══════════════════════════════════════════════════════════════════════════
-- Таблицы, привязанные к объекту
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array[
    'material_movements', 'inspections', 'prescriptions',
    'deviations', 'purchase_requests'
  ] loop
    execute format('alter table mobile.%I enable row level security', t);
    execute format('drop policy if exists %1$s_own_objects on mobile.%1$I', t);
    execute format(
      'create policy %1$s_own_objects on mobile.%1$I
         for all to authenticated
         using      (project_id in (select mobile.my_object_ids()))
         with check (project_id in (select mobile.my_object_ids()))', t);
  end loop;
end $$;

-- assets отличается: техника может лежать на складе без привязки к объекту,
-- и такие единицы должны оставаться видимыми — иначе их нельзя выдать в работу.
alter table mobile.assets enable row level security;
drop policy if exists assets_own_objects on mobile.assets;
create policy assets_own_objects on mobile.assets
  for all to authenticated
  using      (project_id is null or project_id in (select mobile.my_object_ids()))
  with check (project_id is null or project_id in (select mobile.my_object_ids()));

-- ═══════════════════════════════════════════════════════════════════════════
-- Дочерние таблицы: доступ наследуется от родителя
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare r record;
begin
  for r in select * from (values
    ('asset_movements',         'asset_id',        'assets'),
    ('purchase_request_items',  'request_id',      'purchase_requests'),
    ('purchase_orders',         'request_id',      'purchase_requests'),
    ('bpm_instances',           'document_id',     'documents'),
    ('document_signatures',     'document_id',     'documents'),
    ('purchase_order_items',    'order_id',        'purchase_orders'),
    ('warehouse_receipts',      'order_id',        'purchase_orders'),
    ('warehouse_receipt_items', 'receipt_id',      'warehouse_receipts'),
    ('bpm_tasks',               'instance_id',     'bpm_instances')
  ) as v(child, fk, parent) loop
    execute format('alter table mobile.%I enable row level security', r.child);
    execute format('drop policy if exists %1$s_via_parent on mobile.%1$I', r.child);
    execute format(
      'create policy %1$s_via_parent on mobile.%1$I
         for all to authenticated
         using      (exists (select 1 from mobile.%2$I p where p.id = %3$I))
         with check (exists (select 1 from mobile.%2$I p where p.id = %3$I))',
      r.child, r.parent, r.fk);
  end loop;
end $$;

-- Документы адресные: подписант видит свои, плюс всё по своим контрагентам.
alter table mobile.documents enable row level security;
drop policy if exists documents_own on mobile.documents;
create policy documents_own on mobile.documents
  for all to authenticated
  using (
    signer_id = auth.uid()
    or contractor_id in (select mobile.my_contractor_ids())
  )
  with check (
    signer_id = auth.uid()
    or contractor_id in (select mobile.my_contractor_ids())
  );
