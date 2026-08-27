-- ═══════════════════════════════════════════════════════════════════════════
-- Схема `mobile` — собственные таблицы мобильного приложения в базе УСП.
--
-- Разделение схем намеренное: УСП владеет `erp` (сметы, ГПР, договоры),
-- мобилка владеет `mobile` (отчёты, склад, технадзор, закупки). Миграции одной
-- стороны не задевают другую, а связь идёт через внешние ключи на erp.
--
-- ВАЖНО, ИНАЧЕ НИЧЕГО НЕ ЗАРАБОТАЕТ: после применения файла схему нужно
-- открыть в PostgREST. В docker-compose добавьте `mobile` в список схем и
-- перезапустите rest-контейнер:
--     PGRST_DB_SCHEMAS: "public,erp,warehouse,mobile,graphql_public"
-- Проверить: GET /rest/v1/reports с заголовком `Accept-Profile: mobile`
-- должен вернуть [] , а не PGRST106 «Invalid schema».
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists mobile;
grant usage on schema mobile to anon, authenticated, service_role;

-- ── Общая механика ─────────────────────────────────────────────────────────

-- WatermelonDB тянет изменения через `updated_at > since`. Колонка должна
-- обновляться сервером: клиент свою версию не присылает (sync.ts её вырезает),
-- а без триггера строка после UPDATE перестала бы попадать в инкремент.
create or replace function mobile.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ДОСТУП: связь пользователя с контрагентом
--
-- В erp такой связи нет: у profiles только organization_id, у contractors —
-- ничего про пользователей. Без этой таблицы нельзя ответить на вопрос
-- «какие договоры принадлежат вошедшему прорабу», на котором держится вся RLS.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists mobile.contractor_users (
  contractor_id uuid not null references erp.contractors(id) on delete cascade,
  profile_id    uuid not null,
  created_at    timestamptz not null default now(),
  primary key (contractor_id, profile_id)
);

comment on column mobile.contractor_users.profile_id is
  'auth.users.id вошедшего пользователя. Внешнего ключа на erp.profiles нет '
  'намеренно: профиль в УСП может быть заведён позже регистрации в мобилке, '
  'и жёсткая связь блокировала бы выдачу доступа.';

create index if not exists contractor_users_profile_idx
  on mobile.contractor_users (profile_id);

-- ── Хелперы области видимости ──────────────────────────────────────────────
-- security definer: пользователь не имеет прав на чтение erp.contracts
-- напрямую, но должен получать свой список id. Через функцию проверка идёт
-- под владельцем, наружу утекают только id, относящиеся к самому вызывающему.

create or replace function mobile.my_contractor_ids() returns setof uuid
language sql stable security definer set search_path = mobile, erp, pg_temp as $$
  select contractor_id from mobile.contractor_users where profile_id = auth.uid()
$$;

/** Работы договоров, принадлежащих контрагенту пользователя. */
create or replace function mobile.my_assignment_ids() returns setof uuid
language sql stable security definer set search_path = mobile, erp, pg_temp as $$
  select ca.id
  from erp.contract_assignments ca
  join erp.contracts c on c.id = ca.contract_id
  where c.contractor_id in (select mobile.my_contractor_ids())
$$;

/** Объекты (erp.project_objects), на которых у пользователя есть договоры. */
create or replace function mobile.my_object_ids() returns setof uuid
language sql stable security definer set search_path = mobile, erp, pg_temp as $$
  select distinct c.object_id
  from erp.contracts c
  where c.contractor_id in (select mobile.my_contractor_ids())
    and c.object_id is not null
$$;

grant execute on function mobile.my_contractor_ids, mobile.my_assignment_ids,
  mobile.my_object_ids to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ОПЕРАТИВКА: отчёты о выполнении
-- ═══════════════════════════════════════════════════════════════════════════

-- id генерирует клиент (офлайн), поэтому default здесь не нужен — но и не
-- мешает записям, заведённым из SQL.
create table if not exists mobile.reports (
  id                uuid primary key default gen_random_uuid(),
  assignment_id     uuid not null references erp.contract_assignments(id) on delete cascade,
  reported_by       uuid,
  reported_quantity numeric not null,
  status            text not null default 'PENDING',   -- PENDING | APPROVED | REJECTED
  comment           text,
  geo_lat           numeric,
  geo_lon           numeric,
  photo_uri         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists reports_assignment_idx on mobile.reports (assignment_id);
create index if not exists reports_updated_idx    on mobile.reports (updated_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. СКЛАД: журнал движений материалов
--
-- Ведём журнал, а не изменяемый остаток: остаток — производная величина, и его
-- правка с нескольких устройств офлайн неизбежно расходилась бы.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists mobile.material_movements (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references erp.project_objects(id) on delete cascade,
  -- Ресурс строки сметы. Списание по нормам ссылается именно сюда; ручной
  -- приход может прийти без ссылки, тогда позиция опознаётся по названию.
  resource_id   uuid references erp.est_doc_resources(id) on delete set null,
  material_name text not null,
  unit          text,
  type          text not null,          -- RECEIPT | ISSUE | WRITE_OFF | RETURN | TRANSFER | INVENTORY
  quantity      numeric not null,       -- всегда положительное, знак задаёт type
  wbs_item_id   uuid references erp.est_wbs(id) on delete set null,
  receipt_id    uuid,
  comment       text,
  photo_uri     text,
  occurred_at   timestamptz not null default now(),
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists material_movements_project_idx  on mobile.material_movements (project_id);
create index if not exists material_movements_resource_idx on mobile.material_movements (resource_id);
create index if not exists material_movements_updated_idx  on mobile.material_movements (updated_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. РЕСУРСЫ: техника, оборудование, инструмент (единичный учёт)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists mobile.assets (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null,       -- EQUIPMENT | MACHINERY | TOOL
  name             text not null,
  category         text,
  inventory_number text,
  serial_number    text,
  model            text,
  status           text not null default 'IDLE',  -- IN_USE | IDLE | REPAIR | DECOMMISSIONED | LOST
  project_id       uuid references erp.project_objects(id) on delete set null,
  holder_id        uuid,
  holder_name      text,
  commissioned_at  timestamptz,
  next_service_at  timestamptz,
  total_hours      numeric,
  photo_uri        text,
  ext_id           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists assets_project_idx on mobile.assets (project_id);
create index if not exists assets_updated_idx on mobile.assets (updated_at);

create table if not exists mobile.asset_movements (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references mobile.assets(id) on delete cascade,
  type        text not null,            -- ISSUE | RETURN | TRANSFER | SERVICE | SHIFT | DECOMMISSION
  project_id  uuid references erp.project_objects(id) on delete set null,
  from_holder text,
  to_holder   text,
  hours       numeric,
  comment     text,
  photo_uri   text,
  occurred_at timestamptz not null default now(),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists asset_movements_asset_idx   on mobile.asset_movements (asset_id);
create index if not exists asset_movements_updated_idx on mobile.asset_movements (updated_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. ТЕХНАДЗОР: проверки, предписания, отклонения
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists mobile.inspections (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references erp.project_objects(id) on delete cascade,
  wbs_item_id    uuid references erp.est_wbs(id) on delete set null,
  assignment_id  uuid references erp.contract_assignments(id) on delete set null,
  kind           text not null,         -- INCOMING | OPERATIONAL | ACCEPTANCE | HIDDEN_WORK
  result         text not null,         -- PASS | PASS_WITH_REMARKS | FAIL
  title          text not null,
  description    text,
  inspector_id   uuid,
  inspector_name text,
  photo_uri      text,
  geo_lat        numeric,
  geo_lon        numeric,
  inspected_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists inspections_project_idx on mobile.inspections (project_id);
create index if not exists inspections_updated_idx on mobile.inspections (updated_at);

create table if not exists mobile.prescriptions (
  id                    uuid primary key default gen_random_uuid(),
  number                text,
  project_id            uuid not null references erp.project_objects(id) on delete cascade,
  inspection_id         uuid references mobile.inspections(id) on delete set null,
  contractor_id         uuid references erp.contractors(id) on delete set null,
  issued_by             uuid,
  issued_by_name        text,
  severity              text not null default 'MEDIUM',  -- LOW | MEDIUM | HIGH | CRITICAL
  status                text not null default 'OPEN',    -- OPEN | IN_PROGRESS | SUBMITTED | VERIFIED | REJECTED | CLOSED
  title                 text not null,
  description           text,
  requirement           text,
  due_at                timestamptz,
  photo_uri             text,
  resolution_comment    text,
  resolution_photo_uri  text,
  resolved_at           timestamptz,
  closed_at             timestamptz,
  issued_at             timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists prescriptions_project_idx on mobile.prescriptions (project_id);
create index if not exists prescriptions_updated_idx on mobile.prescriptions (updated_at);

create table if not exists mobile.deviations (
  id                 uuid primary key default gen_random_uuid(),
  number             text,
  project_id         uuid not null references erp.project_objects(id) on delete cascade,
  wbs_item_id        uuid references erp.est_wbs(id) on delete set null,
  category           text not null,     -- DESIGN | MATERIAL | TECHNOLOGY | GEOMETRY | OTHER
  status             text not null default 'DRAFT',  -- DRAFT | PENDING | APPROVED | REJECTED | IMPLEMENTED
  title              text not null,
  description        text,
  reason             text,
  proposed_solution  text,
  requested_by       uuid,
  requested_by_name  text,
  decision_comment   text,
  decided_by         uuid,
  decided_at         timestamptz,
  photo_uri          text,
  requested_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists deviations_project_idx on mobile.deviations (project_id);
create index if not exists deviations_updated_idx on mobile.deviations (updated_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. ЗАКУПКИ: заявка → заказ → приёмка
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists mobile.purchase_requests (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references erp.project_objects(id) on delete cascade,
  requested_by   uuid,
  status         text not null default 'DRAFT',
  required_date  date,
  comment        text,
  request_number integer,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists purchase_requests_project_idx on mobile.purchase_requests (project_id);
create index if not exists purchase_requests_updated_idx on mobile.purchase_requests (updated_at);

create table if not exists mobile.purchase_request_items (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null references mobile.purchase_requests(id) on delete cascade,
  resource_id        uuid references erp.est_doc_resources(id) on delete set null,
  estimate_work_id   uuid references erp.est_doc_works(id) on delete set null,
  wbs_item_id        uuid references erp.est_wbs(id) on delete set null,
  requested_quantity numeric not null default 0,
  received_quantity  numeric not null default 0,
  item_name          text,
  unit               text,
  status             text not null default 'PENDING',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists purchase_request_items_request_idx on mobile.purchase_request_items (request_id);
create index if not exists purchase_request_items_updated_idx on mobile.purchase_request_items (updated_at);

create table if not exists mobile.purchase_orders (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references mobile.purchase_requests(id) on delete cascade,
  supplier_id    uuid references erp.contractors(id) on delete set null,
  invoice_number text,
  total_amount   numeric not null default 0,
  status         text not null default 'NEW',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists purchase_orders_request_idx on mobile.purchase_orders (request_id);
create index if not exists purchase_orders_updated_idx on mobile.purchase_orders (updated_at);

create table if not exists mobile.purchase_order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references mobile.purchase_orders(id) on delete cascade,
  request_item_id       uuid not null references mobile.purchase_request_items(id) on delete cascade,
  quantity              numeric not null default 0,
  actual_price_per_unit numeric not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists purchase_order_items_order_idx on mobile.purchase_order_items (order_id);
create index if not exists purchase_order_items_updated_idx on mobile.purchase_order_items (updated_at);

create table if not exists mobile.warehouse_receipts (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references mobile.purchase_orders(id) on delete cascade,
  received_by uuid,
  received_at timestamptz not null default now(),
  photo_url   text,
  comment     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists warehouse_receipts_order_idx   on mobile.warehouse_receipts (order_id);
create index if not exists warehouse_receipts_updated_idx on mobile.warehouse_receipts (updated_at);

create table if not exists mobile.warehouse_receipt_items (
  id                uuid primary key default gen_random_uuid(),
  receipt_id        uuid not null references mobile.warehouse_receipts(id) on delete cascade,
  request_item_id   uuid not null references mobile.purchase_request_items(id) on delete cascade,
  received_quantity numeric not null default 0,
  quality_status    text not null default 'OK',   -- OK | DAMAGED | SHORTAGE
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists warehouse_receipt_items_receipt_idx on mobile.warehouse_receipt_items (receipt_id);
create index if not exists warehouse_receipt_items_updated_idx on mobile.warehouse_receipt_items (updated_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. ДОКУМЕНТЫ И ПОДПИСАНИЕ
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists mobile.documents (
  id              uuid primary key default gen_random_uuid(),
  contractor_id   uuid references erp.contractors(id) on delete set null,
  project_id      uuid references erp.project_objects(id) on delete set null,
  signer_id       uuid,
  bpm_instance_id uuid,
  title           text not null,
  type            text not null,
  number          text not null,
  status          text not null default 'PENDING',
  workflow_status text not null default 'DRAFT',
  pdf_url         text,
  signed_url      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists documents_signer_idx  on mobile.documents (signer_id);
create index if not exists documents_updated_idx on mobile.documents (updated_at);

create table if not exists mobile.bpm_instances (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references mobile.documents(id) on delete cascade,
  status       text not null default 'RUNNING',
  current_step integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists bpm_instances_document_idx on mobile.bpm_instances (document_id);
create index if not exists bpm_instances_updated_idx  on mobile.bpm_instances (updated_at);

create table if not exists mobile.bpm_tasks (
  id          uuid primary key default gen_random_uuid(),
  instance_id uuid not null references mobile.bpm_instances(id) on delete cascade,
  assignee_id uuid,
  step_label  text not null,
  action_type text not null,
  status      text not null default 'PENDING',
  comment     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists bpm_tasks_assignee_idx on mobile.bpm_tasks (assignee_id);
create index if not exists bpm_tasks_updated_idx  on mobile.bpm_tasks (updated_at);

create table if not exists mobile.document_signatures (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references mobile.documents(id) on delete cascade,
  signer_id   uuid not null,
  full_name   text not null,
  -- ИИН приходит из сертификата ЭЦП и на момент локальной записи неизвестен.
  iin         text,
  signed_at   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists document_signatures_document_idx on mobile.document_signatures (document_id);
create index if not exists document_signatures_updated_idx  on mobile.document_signatures (updated_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Триггеры updated_at на все таблицы схемы
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare t record;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'mobile' and table_type = 'BASE TABLE'
      and table_name <> 'contractor_users'
  loop
    execute format(
      'drop trigger if exists touch_%1$s on mobile.%1$I;
       create trigger touch_%1$s before update on mobile.%1$I
       for each row execute function mobile.touch_updated_at();', t.table_name);
  end loop;
end $$;
