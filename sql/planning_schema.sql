-- ==========================================
-- 1. ТИПЫ ДАННЫХ И ИЕРАРХИЯ (WBS)
-- ==========================================

-- Создание типа зависимости, если он не существует
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dependency_type') THEN
        CREATE TYPE dependency_type AS ENUM ('FS', 'SS', 'FF', 'SF');
    END IF;
END $$;

-- Таблица иерархии работ (WBS папки)
CREATE TABLE IF NOT EXISTS public.wbs_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.wbs_items(id) ON DELETE CASCADE, 
    name TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 2. РАСШИРЕНИЕ ТАБЛИЦЫ РАБОТ
-- ==========================================

-- Добавление колонок планирования в estimate_works
-- Мы используем DO блок для безопасного добавления колонок
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='estimate_works' AND column_name='wbs_id') THEN
        ALTER TABLE public.estimate_works ADD COLUMN wbs_id UUID REFERENCES public.wbs_items(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='estimate_works' AND column_name='start_date') THEN
        ALTER TABLE public.estimate_works ADD COLUMN start_date DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='estimate_works' AND column_name='end_date') THEN
        ALTER TABLE public.estimate_works ADD COLUMN end_date DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='estimate_works' AND column_name='duration_days') THEN
        ALTER TABLE public.estimate_works ADD COLUMN duration_days INT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='estimate_works' AND column_name='progress_percent') THEN
        ALTER TABLE public.estimate_works ADD COLUMN progress_percent NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='estimate_works' AND column_name='executor_name') THEN
        ALTER TABLE public.estimate_works ADD COLUMN executor_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wbs_items' AND column_name='depends_on_wbs_id') THEN
        ALTER TABLE public.wbs_items ADD COLUMN depends_on_wbs_id UUID REFERENCES public.wbs_items(id);
    END IF;
END $$;

-- ==========================================
-- 3. ЗАВИСИМОСТИ (ГАНТ)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.work_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    predecessor_id UUID REFERENCES public.estimate_works(id) ON DELETE CASCADE,
    successor_id UUID REFERENCES public.estimate_works(id) ON DELETE CASCADE,
    type dependency_type DEFAULT 'FS',
    lag_days INT DEFAULT 0,
    UNIQUE(predecessor_id, successor_id)
);

-- ==========================================
-- 4. БЕЗОПАСНОСТЬ (RLS)
-- ==========================================

ALTER TABLE public.wbs_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_dependencies ENABLE ROW LEVEL SECURITY;

-- Пример политик (предполагаем наличие функции is_admin())
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins/PTO see all planning') THEN
        CREATE POLICY "Admins/PTO see all planning" ON public.wbs_items FOR ALL TO authenticated USING (public.is_admin());
        CREATE POLICY "Admins/PTO see all dependencies" ON public.work_dependencies FOR ALL TO authenticated USING (public.is_admin());
    END IF;
END $$;
