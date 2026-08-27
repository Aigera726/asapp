-- ======================================================
-- ДОПОЛНЕНИЕ СУЩЕСТВУЮЩЕЙ ТАБЛИЦЫ documents (ПРАВКИ)
-- ======================================================

-- 1. Добавляем недостающие поля
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS signer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Индекс для поиска по номеру (если еще нет)
CREATE UNIQUE INDEX IF NOT EXISTS documents_number_idx ON public.documents (number);

-- 3. Добавляем push_token в профили (обязательно для уведомлений)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- 4. Настройка RLS (Row Level Security)
-- Если политика "Contractors can see their own documents" уже есть, она продолжит работать.
-- Но нам нужна политика для конкретного Подписанта (signer_id), как в ТЗ.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Signers can see their own documents') THEN
        CREATE POLICY "Signers can see their own documents" 
        ON public.documents 
        FOR ALL 
        USING (signer_id = auth.uid());
    END IF;
END $$;

-- Политика для Админов (чтобы могли создавать и видеть всё)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins have full access to documents') THEN
        CREATE POLICY "Admins have full access to documents" 
        ON public.documents 
        FOR ALL 
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'ADMIN'
          )
        );
    END IF;
END $$;
