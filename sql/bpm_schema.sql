-- ==========================================
-- BPM SCHEMA — AS-APP
-- ==========================================
-- Таблица документов: public.documents (существующая)

-- Шаблоны BPM-процессов
CREATE TABLE IF NOT EXISTS public.bpm_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    steps JSONB NOT NULL DEFAULT '[]',
    -- steps: [{id, label, role, assignee_id, action_type, deadline_hours}]
    -- action_type: APPROVE | SIGN | ACKNOWLEDGE
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Экземпляры запущенных процессов
CREATE TABLE IF NOT EXISTS public.bpm_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES public.bpm_templates(id),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'RUNNING',
    -- RUNNING | COMPLETED | REJECTED
    current_step INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

-- Задачи по шагам процесса
CREATE TABLE IF NOT EXISTS public.bpm_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID REFERENCES public.bpm_instances(id) ON DELETE CASCADE,
    step_index INT NOT NULL,
    step_label TEXT,
    assignee_id UUID REFERENCES public.profiles(id),
    assignee_role TEXT,
    action_type TEXT NOT NULL DEFAULT 'APPROVE',
    status TEXT NOT NULL DEFAULT 'PENDING',
    -- PENDING | APPROVED | REJECTED | SKIPPED | WAITING
    comment TEXT,
    completed_at TIMESTAMPTZ,
    deadline_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Подписи ЭЦП (NCALayer)
CREATE TABLE IF NOT EXISTS public.document_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    bpm_task_id UUID REFERENCES public.bpm_tasks(id),
    signer_id UUID REFERENCES public.profiles(id),
    iin TEXT,
    full_name TEXT,
    cert_subject TEXT,
    signed_at TIMESTAMPTZ DEFAULT NOW(),
    cms_signature TEXT,  -- base64 PKCS#7 от NCALayer
    doc_hash TEXT,       -- SHA-256 hash документа на момент подписи
    is_valid BOOLEAN DEFAULT TRUE
);

-- Расширение существующей таблицы документов
ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS bpm_instance_id UUID REFERENCES public.bpm_instances(id),
    ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);
-- workflow_status: DRAFT | IN_REVIEW | APPROVED | REJECTED | SIGNED

-- RLS
ALTER TABLE public.bpm_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bpm_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bpm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;

-- Политики доступа
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_bpm_templates') THEN
        CREATE POLICY "auth_all_bpm_templates" ON public.bpm_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_bpm_instances') THEN
        CREATE POLICY "auth_all_bpm_instances" ON public.bpm_instances FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_bpm_tasks') THEN
        CREATE POLICY "auth_all_bpm_tasks" ON public.bpm_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_doc_signatures') THEN
        CREATE POLICY "auth_all_doc_signatures" ON public.document_signatures FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    -- Верификация подписей доступна публично (для QR-ссылок)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'public_verify_signatures') THEN
        CREATE POLICY "public_verify_signatures" ON public.document_signatures FOR SELECT TO anon USING (true);
    END IF;
END $$;
