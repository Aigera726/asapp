ALTER TABLE ai_project_plans ADD COLUMN IF NOT EXISTS input_params JSONB;
ALTER TABLE ai_project_plans ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Ensure statuses are handled correctly in application
COMMENT ON COLUMN ai_project_plans.status IS 'PROCESSING, COMPLETED, FAILED';
