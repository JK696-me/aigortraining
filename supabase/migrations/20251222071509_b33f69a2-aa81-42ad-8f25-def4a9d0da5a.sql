-- Add template_snapshot column to sessions table
ALTER TABLE public.sessions 
ADD COLUMN template_snapshot jsonb NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.sessions.template_snapshot IS 'Snapshot of template items when session was created from template: [{exercise_id, target_sets, sort_order}]';