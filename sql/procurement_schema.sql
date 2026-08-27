-- ==========================================
-- 1. СТАТУСЫ И ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
-- ==========================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_request_status') THEN
        CREATE TYPE purchase_request_status AS ENUM (
            'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PURCHASING', 
            'ORDERED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'REJECTED'
        );
    END IF;
END $$;

-- Проверка прав админа для RLS
CREATE OR REPLACE FUNCTION public.is_admin() 
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'ADMIN'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 2. КОРПОРАТИВНЫЙ ПРАЙС-ЛИСТ (БАЗА ЦЕН)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.corporate_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID REFERENCES public.estimate_resources(id) ON DELETE CASCADE UNIQUE,
    current_price NUMERIC NOT NULL DEFAULT 0,
    last_supplier_id UUID REFERENCES public.contractors(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 3. ЗАЯВКИ НА ЗАКУПКУ (ПОТОК СНАБЖЕНИЯ)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.purchase_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES public.profiles(id),
    approved_by UUID REFERENCES public.profiles(id),
    status purchase_request_status DEFAULT 'PENDING_APPROVAL',
    required_date DATE NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchase_request_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
    resource_id UUID REFERENCES public.estimate_resources(id),
    estimate_work_id UUID REFERENCES public.estimate_works(id),
    requested_quantity NUMERIC NOT NULL,
    approved_quantity NUMERIC,
    status TEXT DEFAULT 'PENDING' -- PENDING, ORDERED, DELIVERED
);

-- ==========================================
-- 4. ЗАКАЗЫ ПОСТАВЩИКАМ (ФАКТ ЗАКУПКИ)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
    purchased_by UUID REFERENCES public.profiles(id),
    supplier_id UUID REFERENCES public.contractors(id),
    invoice_number TEXT,
    invoice_file_url TEXT,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    request_item_id UUID REFERENCES public.purchase_request_items(id),
    quantity NUMERIC NOT NULL,
    actual_price_per_unit NUMERIC NOT NULL
);

-- ==========================================
-- 5. БЕЗОПАСНОСТЬ (RLS POLICIES)
-- ==========================================
ALTER TABLE public.corporate_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- Пример политик для заявок
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins see all requests') THEN
        CREATE POLICY "Admins see all requests" ON public.purchase_requests FOR ALL TO authenticated USING (public.is_admin());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Contractors see own requests') THEN
        CREATE POLICY "Contractors see own requests" ON public.purchase_requests FOR SELECT TO authenticated USING (requested_by = auth.uid());
    END IF;
END $$;
-- Расширение таблицы items для свободных позиций из мастера заявок
ALTER TABLE public.purchase_request_items
    ADD COLUMN IF NOT EXISTS item_name TEXT,
    ADD COLUMN IF NOT EXISTS item_spec TEXT,
    ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'шт',
    ADD COLUMN IF NOT EXISTS estimated_price NUMERIC DEFAULT 0;
