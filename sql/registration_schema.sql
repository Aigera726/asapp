-- ⚠️ ЛЕГАСИ. НЕ ПРИМЕНЯТЬ НА БАЗЕ УСП.
--
-- Файл из версии до интеграции с УСП: работает со схемой `public`
-- (public.contractors, public.profiles), тогда как вся текущая интеграция
-- живёт в `erp` и `mobile` (см. sql/usp/). Ни одна из заводимых здесь
-- сущностей приложением не используется:
--
--   * access_keys       — ключей доступа нет ни в мобилке, ни в бэкенде УСП;
--   * company_type/bin  — привязка идёт через mobile.link_contractor по
--                         erp.contractors.bin_iin;
--   * ORG_ADMIN         — роль уже есть в erp, добавлять не нужно.
--
-- Политика `admin_all_access_keys` ниже открывает access_keys на чтение И
-- запись любому вошедшему пользователю. Если файл всё-таки был применён —
-- закройте таблицу через sql/usp/08_lock_legacy_access_keys.sql.
--
-- Оставлен для истории.

-- ==========================================
-- REGISTRATION SCHEMA — AS-APP
-- Выполнять по одному блоку!
-- ==========================================

-- 1. Тип компании и доп. поля для contractors
ALTER TABLE public.contractors
    ADD COLUMN IF NOT EXISTS company_type TEXT DEFAULT 'CONTRACTOR',
    -- DEVELOPER | CONTRACTOR | TECH_SUPERVISOR
    ADD COLUMN IF NOT EXISTS bin TEXT,            -- БИН компании
    ADD COLUMN IF NOT EXISTS address TEXT,         -- Юр. адрес
    ADD COLUMN IF NOT EXISTS phone TEXT,           -- Телефон
    ADD COLUMN IF NOT EXISTS director_name TEXT,   -- ФИО руководителя
    ADD COLUMN IF NOT EXISTS email TEXT,           -- Email компании
    ADD COLUMN IF NOT EXISTS website TEXT,         -- Сайт
    ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Одноразовые ключи доступа для девелоперов (создаёт суперадмин)
CREATE TABLE IF NOT EXISTS public.access_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_value TEXT UNIQUE NOT NULL,
    label TEXT,                                    -- Пометка для кого
    company_type TEXT NOT NULL DEFAULT 'DEVELOPER',
    is_used BOOLEAN DEFAULT FALSE,
    used_by_contractor_id UUID REFERENCES public.contractors(id),
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,                        -- NULL = бессрочный
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Новая роль ORG_ADMIN (выполнять отдельно от транзакции!)
-- ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'ORG_ADMIN';

-- RLS для access_keys
ALTER TABLE public.access_keys ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_all_access_keys') THEN
        CREATE POLICY "admin_all_access_keys" ON public.access_keys FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;
