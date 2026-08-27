-- ==========================================
-- ШАХМАТКА КВАРТИР — Миграция БД
-- ==========================================

-- 1. НОВЫЙ ENUM для статуса ячейки шахматки
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'apartment_cell_status') THEN
        CREATE TYPE apartment_cell_status AS ENUM (
            'PENDING',      -- Серый: не начато
            'IN_PROGRESS',  -- Серый с индикатором: в работе
            'REPORTED',     -- Жёлтый: подрядчик сообщил о выполнении
            'APPROVED',     -- Зелёный: технадзор подтвердил
            'REJECTED',     -- Красный: есть замечания
            'CLOSED'        -- Синий: включено в АВР
        );
    END IF;
END $$;

-- 2. НОВЫЙ ENUM для типа помещения
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unit_type') THEN
        CREATE TYPE unit_type AS ENUM (
            'STUDIO',       -- Студия
            '1BR',          -- 1-комнатная
            '2BR',          -- 2-комнатная
            '3BR',          -- 3-комнатная
            '4BR',          -- 4-комнатная
            'PENTHOUSE',    -- Пентхаус
            'OFFICE',       -- Офис
            'COMMERCIAL'    -- Коммерческое
        );
    END IF;
END $$;

-- ==========================================
-- 3. ИЗМЕНЕНИЯ В СУЩЕСТВУЮЩИХ ТАБЛИЦАХ
-- ==========================================

-- Добавляем флаги в projects (тип объекта)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='is_apartment') THEN
        ALTER TABLE public.projects ADD COLUMN is_apartment BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='floors_count') THEN
        ALTER TABLE public.projects ADD COLUMN floors_count INT DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='sections_count') THEN
        ALTER TABLE public.projects ADD COLUMN sections_count INT DEFAULT 1;
    END IF;
END $$;

-- Добавляем флаг поквартирной работы в constructives
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='constructives' AND column_name='is_per_apartment') THEN
        ALTER TABLE public.constructives ADD COLUMN is_per_apartment BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- ==========================================
-- 4. НОВЫЕ ТАБЛИЦЫ
-- ==========================================

-- Квартиры/помещения проекта
CREATE TABLE IF NOT EXISTS public.apartment_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    block TEXT,                          -- Блок (А, Б, В...)
    section TEXT,                        -- Секция (1, 2, 3...)
    floor_number INT NOT NULL,           -- Этаж
    unit_number TEXT NOT NULL,           -- Номер квартиры (201, 202...)
    unit_type unit_type DEFAULT '2BR',   -- Тип помещения
    area_sqm NUMERIC(8,2),               -- Площадь м²
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Типовые шаблоны работ (для 1-комн, 2-комн и т.д.)
CREATE TABLE IF NOT EXISTS public.apartment_work_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                  -- Название шаблона
    unit_type unit_type,                 -- Для какого типа квартир (NULL = для всех)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Позиции шаблона (конструктивы + объёмы)
CREATE TABLE IF NOT EXISTS public.apartment_template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.apartment_work_templates(id) ON DELETE CASCADE,
    constructive_id UUID REFERENCES public.constructives(id),
    work_name TEXT NOT NULL,
    unit TEXT DEFAULT 'м²',
    planned_quantity NUMERIC(10,2) DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ячейки шахматки — главная рабочая таблица
CREATE TABLE IF NOT EXISTS public.apartment_work_cells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    apartment_unit_id UUID NOT NULL REFERENCES public.apartment_units(id) ON DELETE CASCADE,
    constructive_id UUID REFERENCES public.constructives(id),
    template_item_id UUID REFERENCES public.apartment_template_items(id),
    work_name TEXT NOT NULL,
    unit TEXT DEFAULT 'м²',
    planned_quantity NUMERIC(10,2) DEFAULT 1,
    actual_quantity NUMERIC(10,2) DEFAULT 0,
    progress_percent NUMERIC(5,2) DEFAULT 0,  -- 0..100
    status apartment_cell_status DEFAULT 'PENDING',
    reported_by UUID REFERENCES public.profiles(id),
    approved_by UUID REFERENCES public.profiles(id),
    reported_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    rejection_comment TEXT,
    avr_id UUID,                         -- Ссылка на АВР когда закрыто
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- АВР по шахматке
CREATE TABLE IF NOT EXISTS public.apartment_avr (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    avr_number TEXT,                     -- Номер АВР
    period_from DATE,
    period_to DATE,
    status TEXT DEFAULT 'DRAFT',         -- DRAFT, SIGNED, CLOSED
    constructive_filter TEXT,            -- По какому конструктиву сформирован
    total_units INT DEFAULT 0,           -- Кол-во квартир в АВР
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 5. ИНДЕКСЫ для производительности
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_apartment_units_project ON public.apartment_units(project_id);
CREATE INDEX IF NOT EXISTS idx_apartment_units_floor ON public.apartment_units(project_id, floor_number);
CREATE INDEX IF NOT EXISTS idx_apartment_units_section ON public.apartment_units(project_id, section);
CREATE INDEX IF NOT EXISTS idx_apartment_cells_unit ON public.apartment_work_cells(apartment_unit_id);
CREATE INDEX IF NOT EXISTS idx_apartment_cells_constructive ON public.apartment_work_cells(constructive_id);
CREATE INDEX IF NOT EXISTS idx_apartment_cells_status ON public.apartment_work_cells(status);
CREATE INDEX IF NOT EXISTS idx_apartment_cells_avr ON public.apartment_work_cells(avr_id);
CREATE INDEX IF NOT EXISTS idx_apartment_templates_project ON public.apartment_work_templates(project_id);

-- ==========================================
-- 6. RLS (Row Level Security)
-- ==========================================

ALTER TABLE public.apartment_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apartment_work_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apartment_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apartment_work_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apartment_avr ENABLE ROW LEVEL SECURITY;

-- Политики: аутентифицированные пользователи видят всё (как в остальных таблицах проекта)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'apt_units_authenticated') THEN
        CREATE POLICY "apt_units_authenticated" ON public.apartment_units FOR ALL TO authenticated USING (true);
        CREATE POLICY "apt_templates_authenticated" ON public.apartment_work_templates FOR ALL TO authenticated USING (true);
        CREATE POLICY "apt_template_items_authenticated" ON public.apartment_template_items FOR ALL TO authenticated USING (true);
        CREATE POLICY "apt_cells_authenticated" ON public.apartment_work_cells FOR ALL TO authenticated USING (true);
        CREATE POLICY "apt_avr_authenticated" ON public.apartment_avr FOR ALL TO authenticated USING (true);
    END IF;
END $$;
