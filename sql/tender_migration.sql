-- ======================================================
-- ТЕНДЕРНАЯ СИСТЕМА: РАСШИРЕНИЕ СХЕМЫ ЗАКУПОК
-- ======================================================

-- 1. Добавляем колонку дедлайна тендера в основную таблицу заявок
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS tender_deadline DATE;

-- 2. Таблица для хранения предложений (КП) от поставщиков
CREATE TABLE IF NOT EXISTS public.purchase_bids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES public.contractors(id) ON DELETE CASCADE,
    
    total_amount NUMERIC NOT NULL DEFAULT 0,
    delivery_days INT,
    notes TEXT,
    
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'WINNER', 'REJECTED'
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Детализация цен по каждой позиции в конкретном предложении
CREATE TABLE IF NOT EXISTS public.purchase_bid_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_id UUID REFERENCES public.purchase_bids(id) ON DELETE CASCADE,
    request_item_id UUID REFERENCES public.purchase_request_items(id) ON DELETE CASCADE,
    
    price_per_unit NUMERIC NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ======================================================
-- БЕЗОПАСНОСТЬ (RLS)
-- ======================================================
ALTER TABLE public.purchase_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bid_items ENABLE ROW LEVEL SECURITY;

-- Создаем базовые политики (разрешаем админам всё)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins see all bids') THEN
        CREATE POLICY "Admins see all bids" ON public.purchase_bids FOR ALL TO authenticated USING (public.is_admin());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins see all bid items') THEN
        CREATE POLICY "Admins see all bid items" ON public.purchase_bid_items FOR ALL TO authenticated USING (public.is_admin());
    END IF;
END $$;
