-- Add rpe_display column to session_exercises for caching aggregated RPE
ALTER TABLE public.session_exercises 
ADD COLUMN IF NOT EXISTS rpe_display integer;

-- Add comment explaining the column
COMMENT ON COLUMN public.session_exercises.rpe_display IS 'Cached aggregated RPE from sets - last completed set with rpe value';