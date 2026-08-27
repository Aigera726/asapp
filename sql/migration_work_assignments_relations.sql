-- Migration: Add proper foreign key relations and indexes for work_assignments
-- Purpose: Optimize queries for fetching work names in assignments

-- ==========================================
-- 0. CLEANUP INVALID REFERENCES (must be done BEFORE adding constraints)
-- ==========================================
-- Remove work_assignments with non-existent resource_id
DELETE FROM public.work_assignments 
WHERE resource_id IS NOT NULL 
  AND resource_id NOT IN (SELECT id FROM public.estimate_resources);

-- Remove work_assignments with non-existent estimate_work_id
DELETE FROM public.work_assignments 
WHERE estimate_work_id IS NOT NULL 
  AND estimate_work_id NOT IN (SELECT id FROM public.estimate_works);

-- Remove work_assignments with non-existent wbs_item_id
DELETE FROM public.work_assignments 
WHERE wbs_item_id IS NOT NULL 
  AND wbs_item_id NOT IN (SELECT id FROM public.wbs_items);

-- ==========================================
-- 1. ENSURE FOREIGN KEY CONSTRAINTS (if not already exist)
-- ==========================================
DO $$ 
BEGIN
  -- Add FK for estimate_work_id if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_wa_estimate_work'
  ) THEN
    ALTER TABLE public.work_assignments
    ADD CONSTRAINT fk_wa_estimate_work 
      FOREIGN KEY (estimate_work_id) 
      REFERENCES public.estimate_works(id) 
      ON DELETE SET NULL;
  END IF;

  -- Add FK for wbs_item_id if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_wa_wbs_item'
  ) THEN
    ALTER TABLE public.work_assignments
    ADD CONSTRAINT fk_wa_wbs_item 
      FOREIGN KEY (wbs_item_id) 
      REFERENCES public.wbs_items(id) 
      ON DELETE SET NULL;
  END IF;

  -- Add FK for resource_id if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_wa_resource'
  ) THEN
    ALTER TABLE public.work_assignments
    ADD CONSTRAINT fk_wa_resource 
      FOREIGN KEY (resource_id) 
      REFERENCES public.estimate_resources(id) 
      ON DELETE SET NULL;
  END IF;
END $$;

-- ==========================================
-- 2. CREATE INDEXES FOR JOINS (if not already exist)
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_wa_estimate_work_id ON public.work_assignments(estimate_work_id);
CREATE INDEX IF NOT EXISTS idx_wa_wbs_item_id ON public.work_assignments(wbs_item_id);
CREATE INDEX IF NOT EXISTS idx_wa_resource_id ON public.work_assignments(resource_id);
CREATE INDEX IF NOT EXISTS idx_wa_contract_id ON public.work_assignments(contract_id);
CREATE INDEX IF NOT EXISTS idx_wa_status ON public.work_assignments(status);
CREATE INDEX IF NOT EXISTS idx_wa_updated_at ON public.work_assignments(updated_at DESC);

-- ==========================================
-- 3. CREATE VIEW FOR OPTIMIZED QUERIES
-- ==========================================
CREATE OR REPLACE VIEW public.work_assignments_with_details AS
SELECT
  wa.id,
  wa.contract_id,
  wa.estimate_work_id,
  wa.wbs_item_id,
  wa.resource_id,
  wa.assignment_type,
  wa.assigned_quantity,
  wa.status,
  wa.updated_at,
  -- Work name priority: WBS > EstimateWork > Resource
  COALESCE(wi.name, ew.name, er.name, 'Unknown') AS work_name,
  COALESCE(ew.unit, er.unit, 'ед.') AS work_unit,
  -- Additional info
  c.contractor_id,
  c.project_id,
  ew.total_quantity,
  COALESCE(wi.name, '') || CASE WHEN ew.name IS NOT NULL THEN ' / ' || ew.name ELSE '' END AS display_name
FROM public.work_assignments wa
LEFT JOIN public.contracts c ON c.id = wa.contract_id
LEFT JOIN public.estimate_works ew ON ew.id = wa.estimate_work_id
LEFT JOIN public.wbs_items wi ON wi.id = wa.wbs_item_id
LEFT JOIN public.estimate_resources er ON er.id = wa.resource_id;

-- ==========================================
-- 4. GRANT PERMISSIONS (for RLS policies)
-- ==========================================
ALTER VIEW public.work_assignments_with_details OWNER TO postgres;

-- Optional: Enable RLS on view (requires additional setup)
-- For now, queries should filter through work_assignments base table
