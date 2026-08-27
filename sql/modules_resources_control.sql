-- ==========================================
-- AS-APP — разделы «Ресурсы» и «Контроль»
-- ==========================================
--
-- Ресурсы:  оборудование, техника, инструменты (единичный учёт)
--           материалы (количественный учёт через журнал движений)
-- Контроль: проверки технадзора, предписания, технические отклонения
--
-- Схема повторяет src/database/schema.ts (версия 9). Пока этот скрипт не
-- выполнен, разделы работают ЛОКАЛЬНО: синхронизация помечает такие таблицы
-- как необязательные и не падает из-за их отсутствия (см. PULL_TABLES).
--
-- ВАЖНО про RLS. У существующих таблиц (profiles, reports, work_assignments,
-- contractors) политик нет вообще: публичный anon-ключ, зашитый в бандл
-- приложения, читает и пишет всю базу. Здесь RLS включён с самого начала.
-- Существующие таблицы нужно закрыть отдельно.
--
-- Выполнять в Supabase → SQL Editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Единая функция обновления updated_at: инкрементальная синхронизация
-- опирается на эту колонку, и без триггера она не двигалась бы при UPDATE.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END $$;


-- ==========================================
-- 1. РЕСУРСЫ: единицы учёта
-- ==========================================
CREATE TABLE IF NOT EXISTS public.assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- EQUIPMENT | MACHINERY | TOOL
    kind TEXT NOT NULL DEFAULT 'TOOL',
    name TEXT NOT NULL,
    category TEXT,
    inventory_number TEXT,
    serial_number TEXT,
    model TEXT,
    -- IN_USE | IDLE | REPAIR | DECOMMISSIONED | LOST
    status TEXT NOT NULL DEFAULT 'IDLE',
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    holder_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    holder_name TEXT,
    commissioned_at TIMESTAMPTZ,
    next_service_at TIMESTAMPTZ,
    total_hours NUMERIC,
    photo_uri TEXT,
    ext_id VARCHAR(36) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.asset_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    -- ISSUE | RETURN | TRANSFER | SERVICE | SHIFT | DECOMMISSION
    type TEXT NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    from_holder TEXT,
    to_holder TEXT,
    -- Наработка за смену, машино-часы
    hours NUMERIC,
    comment TEXT,
    photo_uri TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ==========================================
-- 2. МАТЕРИАЛЫ: журнал движений склада
-- ==========================================
-- Остаток намеренно НЕ хранится отдельной изменяемой строкой: правка одного
-- и того же остатка с нескольких устройств офлайн неизбежно расходится.
-- Остаток — агрегация журнала (см. MATERIAL_MOVEMENT_SIGN в src/lib/domain.ts).
CREATE TABLE IF NOT EXISTS public.material_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    resource_id UUID REFERENCES public.estimate_resources(id) ON DELETE SET NULL,
    material_name TEXT NOT NULL,
    unit TEXT,
    -- RECEIPT | ISSUE | WRITE_OFF | RETURN | TRANSFER | INVENTORY
    type TEXT NOT NULL,
    -- Всегда положительное, знак задаёт type
    quantity NUMERIC NOT NULL CHECK (quantity >= 0),
    wbs_item_id UUID REFERENCES public.wbs_items(id) ON DELETE SET NULL,
    receipt_id UUID,
    comment TEXT,
    photo_uri TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ==========================================
-- 3. КОНТРОЛЬ: проверки технадзора
-- ==========================================
CREATE TABLE IF NOT EXISTS public.inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    wbs_item_id UUID REFERENCES public.wbs_items(id) ON DELETE SET NULL,
    assignment_id UUID REFERENCES public.work_assignments(id) ON DELETE SET NULL,
    -- INCOMING | OPERATIONAL | ACCEPTANCE | HIDDEN_WORK
    kind TEXT NOT NULL DEFAULT 'OPERATIONAL',
    -- PASS | PASS_WITH_REMARKS | FAIL
    result TEXT NOT NULL DEFAULT 'PASS',
    title TEXT NOT NULL,
    description TEXT,
    inspector_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    inspector_name TEXT,
    photo_uri TEXT,
    geo_lat DOUBLE PRECISION,
    geo_lon DOUBLE PRECISION,
    inspected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_status TEXT NOT NULL DEFAULT 'synced',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ==========================================
-- 4. КОНТРОЛЬ: предписания
-- ==========================================
CREATE TABLE IF NOT EXISTS public.prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number TEXT,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    inspection_id UUID REFERENCES public.inspections(id) ON DELETE SET NULL,
    contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL,
    issued_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    issued_by_name TEXT,
    -- LOW | MEDIUM | HIGH | CRITICAL
    severity TEXT NOT NULL DEFAULT 'MEDIUM',
    -- OPEN | IN_PROGRESS | SUBMITTED | VERIFIED | REJECTED | CLOSED
    status TEXT NOT NULL DEFAULT 'OPEN',
    title TEXT NOT NULL,
    description TEXT,
    requirement TEXT,
    due_at TIMESTAMPTZ,
    photo_uri TEXT,
    resolution_comment TEXT,
    resolution_photo_uri TEXT,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_status TEXT NOT NULL DEFAULT 'synced',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Сквозная нумерация предписаний по объекту: «ПР-2026-0001»
CREATE SEQUENCE IF NOT EXISTS public.prescription_number_seq;

CREATE OR REPLACE FUNCTION public.assign_prescription_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.number IS NULL OR NEW.number = '' THEN
        NEW.number := 'ПР-' || to_char(NOW(), 'YYYY') || '-' ||
                      lpad(nextval('public.prescription_number_seq')::text, 4, '0');
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prescription_number ON public.prescriptions;
CREATE TRIGGER trg_prescription_number
    BEFORE INSERT ON public.prescriptions
    FOR EACH ROW EXECUTE FUNCTION public.assign_prescription_number();


-- ==========================================
-- 5. КОНТРОЛЬ: технические отклонения
-- ==========================================
CREATE TABLE IF NOT EXISTS public.deviations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number TEXT,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    wbs_item_id UUID REFERENCES public.wbs_items(id) ON DELETE SET NULL,
    -- DESIGN | MATERIAL | TECHNOLOGY | GEOMETRY | OTHER
    category TEXT NOT NULL DEFAULT 'OTHER',
    -- DRAFT | PENDING | APPROVED | REJECTED | IMPLEMENTED
    status TEXT NOT NULL DEFAULT 'PENDING',
    title TEXT NOT NULL,
    description TEXT,
    reason TEXT,
    proposed_solution TEXT,
    requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    requested_by_name TEXT,
    decision_comment TEXT,
    decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    photo_uri TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_status TEXT NOT NULL DEFAULT 'synced',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS public.deviation_number_seq;

CREATE OR REPLACE FUNCTION public.assign_deviation_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.number IS NULL OR NEW.number = '' THEN
        NEW.number := 'ТО-' || to_char(NOW(), 'YYYY') || '-' ||
                      lpad(nextval('public.deviation_number_seq')::text, 4, '0');
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deviation_number ON public.deviations;
CREATE TRIGGER trg_deviation_number
    BEFORE INSERT ON public.deviations
    FOR EACH ROW EXECUTE FUNCTION public.assign_deviation_number();


-- ==========================================
-- 6. Триггеры updated_at и индексы
-- ==========================================
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'assets','asset_movements','material_movements',
        'inspections','prescriptions','deviations'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.%I', t);
        EXECUTE format(
            'CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.%I
               FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t);
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_%s_updated_at ON public.%I (updated_at)', t, t);
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_assets_kind_status ON public.assets (kind, status);
CREATE INDEX IF NOT EXISTS idx_assets_project ON public.assets (project_id);
CREATE INDEX IF NOT EXISTS idx_asset_movements_asset ON public.asset_movements (asset_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_movements_project ON public.material_movements (project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_movements_resource ON public.material_movements (project_id, resource_id);
CREATE INDEX IF NOT EXISTS idx_inspections_project ON public.inspections (project_id, inspected_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON public.prescriptions (project_id, status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_due ON public.prescriptions (due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deviations_status ON public.deviations (project_id, status);


-- ==========================================
-- 7. RLS
-- ==========================================
-- Минимально разумная политика: данные видит и создаёт любой
-- аутентифицированный сотрудник, а удалять может только автор записи или
-- администратор. Это НЕ полноценная модель доступа по объектам — её надо
-- строить вместе с закрытием остальных таблиц. Но публичный anon-ключ сюда
-- уже не проходит, в отличие от существующих таблиц.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
         WHERE id = auth.uid()
           AND role IN ('ADMIN', 'ORG_ADMIN', 'PTO')
    );
$$;

DO $$
DECLARE
    t TEXT;
    author_col TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'assets','asset_movements','material_movements',
        'inspections','prescriptions','deviations'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

        -- Колонка автора у таблиц называется по-разному
        author_col := CASE t
            WHEN 'inspections' THEN 'inspector_id'
            WHEN 'prescriptions' THEN 'issued_by'
            WHEN 'deviations' THEN 'requested_by'
            WHEN 'assets' THEN NULL
            ELSE 'created_by'
        END;

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
            t || '_select', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
            t || '_insert', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
            t || '_update', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
        IF author_col IS NULL THEN
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin())',
                t || '_delete', t);
        ELSE
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
                   USING (%I = auth.uid() OR public.is_admin())',
                t || '_delete', t, author_col);
        END IF;
    END LOOP;
END $$;


-- ==========================================
-- 8. Проверка
-- ==========================================
SELECT c.relname AS "таблица",
       c.relrowsecurity AS "rls",
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS "политик"
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('assets','asset_movements','material_movements',
                     'inspections','prescriptions','deviations')
 ORDER BY 1;
