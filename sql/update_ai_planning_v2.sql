-- Add delivery_date to tools
ALTER TABLE public.ai_tools_needed ADD COLUMN IF NOT EXISTS delivery_date DATE;

-- Add related_work_id to link resources to specific works
ALTER TABLE public.ai_material_schedule ADD COLUMN IF NOT EXISTS related_work_id UUID;
ALTER TABLE public.ai_equipment_schedule ADD COLUMN IF NOT EXISTS related_work_id UUID;
ALTER TABLE public.ai_tools_needed ADD COLUMN IF NOT EXISTS related_work_id UUID;
