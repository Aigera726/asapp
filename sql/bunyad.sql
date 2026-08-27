-- ==========================================
-- 1. ENUMS (ПЕРЕЧИСЛЕНИЯ СТАТУСОВ)
-- ==========================================
CREATE TYPE contract_type AS ENUM ('FIXED', 'OPEN');
CREATE TYPE report_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE user_role AS ENUM ('ADMIN', 'PTO', 'TECH_SUPERVISOR', 'CONTRACTOR', 'STOREKEEPER');
CREATE TYPE hidden_work_status AS ENUM ('DRAFT', 'PENDING_INSPECTION', 'APPROVED', 'REJECTED');
CREATE TYPE work_status AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SUSPENDED');
CREATE TYPE delivery_status AS ENUM ('SCHEDULED', 'DELIVERED', 'ACCEPTED_WITH_COMMENTS', 'REJECTED');
CREATE TYPE checklist_result AS ENUM ('PASS', 'FAIL');
CREATE TYPE signed_document_type AS ENUM ('HIDDEN_WORK_ACT', 'KS2_ACT', 'DELIVERY_ACT');

-- ==========================================
-- 2. ИЕРАРХИЯ И КОНТРАГЕНТЫ
-- ==========================================
CREATE TABLE construction_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    ext_id VARCHAR(36) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID REFERENCES construction_objects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    ext_id VARCHAR(36) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE contractors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    bin_iin VARCHAR(12) UNIQUE,
    ext_id VARCHAR(36) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'CONTRACTOR',
    contractor_id UUID REFERENCES contractors(id),
    full_name TEXT,
    ext_id VARCHAR(36) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 3. СМЕТЫ (ВЕРСИОНИРОВАНИЕ) И РЕСУРСЫ
-- ==========================================
-- Базовый контейнер сметы
CREATE TABLE estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    ext_id VARCHAR(36) UNIQUE, -- Общий ID документа из 1С
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Версии сметы (Защита истории)
CREATE TABLE estimate_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_id UUID REFERENCES estimates(id) ON DELETE CASCADE,
    version_number INT NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE, -- TRUE для последней актуальной сметы
    reason_for_change TEXT, -- Например: 'Первичная', 'Доп. соглашение №1'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Работы (привязаны к конкретной версии)
CREATE TABLE estimate_works (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID REFERENCES estimate_versions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    total_quantity NUMERIC NOT NULL,
    ext_id VARCHAR(36) UNIQUE, -- ID конкретной строки из 1С
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Финансы (Скрыты от прорабов)
CREATE TABLE estimate_financials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_work_id UUID REFERENCES estimate_works(id) ON DELETE CASCADE,
    price_per_unit NUMERIC NOT NULL,
    total_cost NUMERIC NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE estimate_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_work_id UUID REFERENCES estimate_works(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    norm_per_unit NUMERIC NOT NULL,
    ext_id VARCHAR(36) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 4. ГРАФИКИ И РАСПРЕДЕЛЕНИЕ
-- ==========================================
CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE,
    contract_number TEXT,
    ext_id VARCHAR(36) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Распределение объемов на подрядчика
CREATE TABLE work_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_work_id UUID REFERENCES estimate_works(id) ON DELETE CASCADE,
    contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
    assignment_type contract_type DEFAULT 'FIXED',
    assigned_quantity NUMERIC,
    status work_status DEFAULT 'PLANNED',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 5. ОПЕРАЦИОНКА И ПРИЕМКА (МОБИЛКА)
-- ==========================================
-- Факт выполнения работ (Очищено от Голосового ИИ)
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES work_assignments(id) ON DELETE CASCADE,
    reported_by UUID REFERENCES profiles(id),
    reported_quantity NUMERIC NOT NULL,
    status report_status DEFAULT 'PENDING',
    comment TEXT,
    geo_lat NUMERIC,
    geo_lon NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Приемка материалов (AI Vision сохранен)
CREATE TABLE material_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_resource_id UUID REFERENCES estimate_resources(id),
    received_by UUID REFERENCES profiles(id),
    delivered_quantity NUMERIC NOT NULL,
    status delivery_status DEFAULT 'DELIVERED',
    
    ai_vision_metadata JSONB, 
    is_ai_verified BOOLEAN DEFAULT FALSE,
    
    checklist_result checklist_result,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 6. ЮРИДИЧЕСКИ ЗНАЧИМЫЙ ЭДО (ЭЦП / KALKAN)
-- ==========================================
CREATE TABLE e_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL, 
    document_type signed_document_type NOT NULL,
    signer_id UUID REFERENCES profiles(id), 
    
    signature_cms TEXT NOT NULL, 
    cert_subject_iin VARCHAR(12), 
    signed_hash TEXT NOT NULL, 
    
    signed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hidden_works_acts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    work_name TEXT NOT NULL,
    status hidden_work_status DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 7. ЛОГИ ИНТЕГРАЦИИ
-- ==========================================
CREATE TABLE sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    status TEXT NOT NULL,
    response_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);