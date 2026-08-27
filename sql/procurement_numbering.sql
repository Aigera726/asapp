-- ==========================================
-- ПЕРЕХОД НА ПОПОРЯДКОВУЮ НУМЕРАЦИЮ ЗАЯВОК (С ПРЕФИКСОМ ПРОЕКТА)
-- ==========================================

-- 1. Добавляем префикс в проекты
ALTER TABLE public.projects 
    ADD COLUMN IF NOT EXISTS prefix TEXT DEFAULT 'GA';

-- 2. Добавляем порядковый номер в заявки
ALTER TABLE public.purchase_requests 
    ADD COLUMN IF NOT EXISTS request_number INTEGER;

-- 3. Функция для автоматической генерации номера внутри проекта
CREATE OR REPLACE FUNCTION public.generate_purchase_request_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
BEGIN
    -- Если номер уже задан (например, при миграции), не меняем его
    IF NEW.request_number IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Находим максимальный номер для данного проекта и прибавляем 1
    SELECT COALESCE(MAX(request_number), 0) + 1 
    INTO next_num
    FROM public.purchase_requests
    WHERE project_id = NEW.project_id;

    NEW.request_number := next_num;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Триггер
DROP TRIGGER IF EXISTS trg_generate_purchase_request_number ON public.purchase_requests;
CREATE TRIGGER trg_generate_purchase_request_number
    BEFORE INSERT ON public.purchase_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_purchase_request_number();

-- 5. Обновляем существующие заявки (проставляем номера)
DO $$
DECLARE
    r RECORD;
    i INTEGER;
BEGIN
    FOR r IN (SELECT DISTINCT project_id FROM public.purchase_requests) LOOP
        i := 1;
        FOR r IN (SELECT id FROM public.purchase_requests WHERE project_id = r.project_id ORDER BY created_at ASC) LOOP
            UPDATE public.purchase_requests SET request_number = i WHERE id = r.id;
            i := i + 1;
        END LOOP;
    END LOOP;
END $$;
