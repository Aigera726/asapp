-- database/migrations/ai_planning_schema.sql

-- 1. Таблица для сессий ИИ-планирования
CREATE TABLE IF NOT EXISTS public.ai_project_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    estimate_id UUID REFERENCES public.estimates(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id),
    status TEXT DEFAULT 'DRAFT', -- DRAFT, COMPLETED
    start_date DATE,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    raw_ai_response JSONB -- Сохраняем полный ответ ИИ для истории
);

-- 2. Бригады, определенные ИИ
CREATE TABLE IF NOT EXISTS public.ai_brigades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES public.ai_project_plans(id) ON DELETE CASCADE,
    brigade_type TEXT NOT NULL, -- например, 'Бетонщики', 'Электрики'
    workers_count INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. График поставки материалов
CREATE TABLE IF NOT EXISTS public.ai_material_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES public.ai_project_plans(id) ON DELETE CASCADE,
    material_name TEXT NOT NULL,
    quantity NUMERIC,
    unit TEXT,
    delivery_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. График машин и механизмов
CREATE TABLE IF NOT EXISTS public.ai_equipment_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES public.ai_project_plans(id) ON DELETE CASCADE,
    equipment_name TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Необходимые инструменты
CREATE TABLE IF NOT EXISTS public.ai_tools_needed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES public.ai_project_plans(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    quantity INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Риски
CREATE TABLE IF NOT EXISTS public.ai_risks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES public.ai_project_plans(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    mitigation_strategy TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Включаем RLS
ALTER TABLE public.ai_project_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_brigades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_material_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_equipment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tools_needed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_risks ENABLE ROW LEVEL SECURITY;

-- Политики (если is_admin() существует)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin') THEN
        CREATE POLICY "Admins see all AI plans" ON public.ai_project_plans FOR ALL TO authenticated USING (public.is_admin());
        CREATE POLICY "Admins see all AI brigades" ON public.ai_brigades FOR ALL TO authenticated USING (public.is_admin());
        CREATE POLICY "Admins see all AI materials" ON public.ai_material_schedule FOR ALL TO authenticated USING (public.is_admin());
        CREATE POLICY "Admins see all AI equipment" ON public.ai_equipment_schedule FOR ALL TO authenticated USING (public.is_admin());
        CREATE POLICY "Admins see all AI tools" ON public.ai_tools_needed FOR ALL TO authenticated USING (public.is_admin());
        CREATE POLICY "Admins see all AI risks" ON public.ai_risks FOR ALL TO authenticated USING (public.is_admin());
    END IF;
END $$;
