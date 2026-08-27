-- SQL Миграция: Закрытый цикл закупок (Closed-loop Procurement)
-- Описание: Добавляет статусы, таблицы складской приёмки и View для контроля остатков.

-- 1. РАСШИРЕНИЕ СТАТУСОВ (Если ENUM уже есть, добавляем новые значения через ALTER TYPE)
DO $$ 
BEGIN
    -- Добавляем новые статусы в существующий ENUM (если они еще не добавлены)
    ALTER TYPE public.purchase_request_status ADD VALUE IF NOT EXISTS 'PENDING_PTO'; -- Ожидает ПТО
    ALTER TYPE public.purchase_request_status ADD VALUE IF NOT EXISTS 'IN_TRANSIT';  -- В пути
    ALTER TYPE public.purchase_request_status ADD VALUE IF NOT EXISTS 'PARTIALLY_RECEIVED'; -- Принято частично
EXCEPTION
    WHEN OTHERS THEN NULL; 
END $$;

-- 2. ДОБАВЛЕНИЕ КОЛОНОК В purchase_requests
ALTER TABLE public.purchase_requests 
    ADD COLUMN IF NOT EXISTS over_budget BOOLEAN DEFAULT FALSE,     -- Флаг превышения сметы
    ADD COLUMN IF NOT EXISTS pto_approved_by UUID REFERENCES auth.users(id), 
    ADD COLUMN IF NOT EXISTS pto_comment TEXT,
    ADD COLUMN IF NOT EXISTS urgency VARCHAR(20) DEFAULT 'normal',   -- normal, urgent, critical
    ADD COLUMN IF NOT EXISTS required_date DATE,                     -- Когда нужно на объекте
    ADD COLUMN IF NOT EXISTS tender_deadline DATE,                   -- уже может быть, безопасно
    ADD COLUMN IF NOT EXISTS lot_id UUID;                            -- Централизованный лот (фаза 2)

-- 3. РАСШИРЕНИЕ ТАБЛИЦЫ purchase_request_items
ALTER TABLE public.purchase_request_items
    ADD COLUMN IF NOT EXISTS budget_remaining NUMERIC,               -- кэш остатка по смете на момент заявки
    ADD COLUMN IF NOT EXISTS received_quantity NUMERIC DEFAULT 0;    -- факт приёмки на складе

-- 4. ТАБЛИЦЫ СКЛАДСКОЙ ПРИЁМКИ
CREATE TABLE IF NOT EXISTS public.warehouse_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    received_by UUID REFERENCES auth.users(id),
    received_at TIMESTAMPTZ DEFAULT NOW(),
    photo_url TEXT,                                                  -- Ссылка на фото накладной/товара
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.warehouse_receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID REFERENCES public.warehouse_receipts(id) ON DELETE CASCADE,
    request_item_id UUID REFERENCES public.purchase_request_items(id) ON DELETE CASCADE,
    received_quantity NUMERIC NOT NULL,
    quality_status VARCHAR(20) DEFAULT 'OK',                         -- OK, DAMAGED, SHORTAGE
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. RLS ПОЛИТИКИ ДЛЯ СКЛАДА
ALTER TABLE public.warehouse_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_receipt_items ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own receipts') THEN
        CREATE POLICY "Users see own receipts" ON public.warehouse_receipts
            FOR SELECT TO authenticated USING (received_by = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins see all receipt items') THEN
        CREATE POLICY "Admins see all receipt items" ON public.warehouse_receipt_items
            FOR ALL TO authenticated USING (public.is_admin());
    END IF;
END $$;

-- 6. VIEW: Расчёт остатка по смете (для быстрой проверки лимитов)
-- Использует расчет (Норма * Объем работы) и подтягивает цены из corporate_prices
DROP VIEW IF EXISTS public.v_estimate_resource_balance;
CREATE OR REPLACE VIEW public.v_estimate_resource_balance AS
SELECT
    er.id AS resource_id,
    er.name,
    er.unit,
    (ew.total_quantity * er.norm_per_unit) AS planned_quantity,
    cp.current_price AS price,
    er.estimate_work_id,
    ew.version_id,
    ew.constructive_id,
    ew.name AS work_name,
    COALESCE(SUM(pri.requested_quantity) FILTER (
        WHERE pr.status NOT IN ('REJECTED', 'DELIVERED')
    ), 0) AS already_requested,
    (ew.total_quantity * er.norm_per_unit) - COALESCE(SUM(pri.requested_quantity) FILTER (
        WHERE pr.status NOT IN ('REJECTED', 'DELIVERED')
    ), 0) AS balance_remaining,
    COALESCE(SUM(pri.received_quantity), 0) AS already_received
FROM public.estimate_resources er
LEFT JOIN public.estimate_works ew ON ew.id = er.estimate_work_id
LEFT JOIN public.corporate_prices cp ON cp.resource_id = er.id
LEFT JOIN public.purchase_request_items pri ON pri.resource_id = er.id
LEFT JOIN public.purchase_requests pr ON pr.id = pri.request_id
GROUP BY er.id, er.name, er.unit, ew.total_quantity, er.norm_per_unit, cp.current_price, 
         er.estimate_work_id, ew.version_id, ew.constructive_id, ew.name;

-- 7. ПРАВА ДОСТУПА
GRANT SELECT ON public.v_estimate_resource_balance TO authenticated;
GRANT SELECT ON public.v_estimate_resource_balance TO service_role;

