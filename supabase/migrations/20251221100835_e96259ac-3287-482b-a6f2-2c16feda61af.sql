-- Add sort_order column to session_exercises
ALTER TABLE public.session_exercises 
ADD COLUMN IF NOT EXISTS sort_order integer;

-- Set initial sort_order based on created_at order for existing records
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at) as rn
  FROM public.session_exercises
)
UPDATE public.session_exercises se
SET sort_order = ordered.rn
FROM ordered
WHERE se.id = ordered.id;