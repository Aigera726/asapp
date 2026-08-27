-- ==========================================
-- AS-APP — добавление updated_at в таблицы, где его нет
-- ==========================================
--
-- Проблема: WatermelonDB синхронизируется инкрементально по updated_at, но у
-- четырёх таблиц этой колонки в Supabase не оказалось. Запрос
-- `?updated_at=gt.<since>` возвращал по ним 400 (42703
-- «column ... does not exist»). Ошибки не проверялись и молча терялись —
-- синхронизация завершалась «успешно», а данные подтягивались неполностью.
--
-- Проверено на живой базе: колонки нет в
--   purchase_order_items, warehouse_receipt_items,
--   bpm_instances, document_signatures
--
-- Пока миграция не выполнена, приложение тянет эти таблицы целиком
-- (см. PULL_TABLES в src/database/sync.ts — incremental: false). Скрипт ниже
-- позволяет вернуть их на инкрементальную загрузку.
--
-- Выполнять в Supabase → SQL Editor.


-- 1. Сама колонка
ALTER TABLE public.purchase_order_items
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.warehouse_receipt_items
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.bpm_instances
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.document_signatures
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();


-- 2. Триггер: без него updated_at не двигается при UPDATE, и инкрементальная
--    загрузка не увидит изменений — только вставки.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END $$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'purchase_order_items',
        'warehouse_receipt_items',
        'bpm_instances',
        'document_signatures'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.%I', t);
        EXECUTE format(
            'CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.%I
               FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t);
    END LOOP;
END $$;


-- 3. Индексы: инкрементальная выборка всегда идёт по updated_at
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_updated_at
    ON public.purchase_order_items (updated_at);
CREATE INDEX IF NOT EXISTS idx_warehouse_receipt_items_updated_at
    ON public.warehouse_receipt_items (updated_at);
CREATE INDEX IF NOT EXISTS idx_bpm_instances_updated_at
    ON public.bpm_instances (updated_at);
CREATE INDEX IF NOT EXISTS idx_document_signatures_updated_at
    ON public.document_signatures (updated_at);


-- 4. Проверка: должно вернуть 4 строки
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND column_name = 'updated_at'
   AND table_name IN (
        'purchase_order_items',
        'warehouse_receipt_items',
        'bpm_instances',
        'document_signatures'
   )
 ORDER BY table_name;


-- 5. Полный аудит: какие ещё таблицы синхронизации остались без updated_at
SELECT t.table_name
  FROM information_schema.tables t
 WHERE t.table_schema = 'public'
   AND t.table_name IN (
        'construction_objects','contractors','projects','estimate_resources',
        'estimate_works','wbs_items','contracts','work_assignments','reports',
        'documents','purchase_requests','purchase_request_items',
        'purchase_orders','purchase_order_items','warehouse_receipts',
        'warehouse_receipt_items','bpm_instances','bpm_tasks',
        'document_signatures'
   )
   AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
         WHERE c.table_schema = t.table_schema
           AND c.table_name = t.table_name
           AND c.column_name = 'updated_at'
   )
 ORDER BY 1;

-- После выполнения миграции можно вернуть эти таблицы на инкрементальную
-- загрузку: в src/database/sync.ts поставить им incremental: true.
