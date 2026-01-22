ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NULL;

ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS auto_completed BOOLEAN NOT NULL DEFAULT false;

-- Backfill: use started_at as initial activity for existing draft sessions where missing
UPDATE public.sessions
SET last_activity_at = COALESCE(last_activity_at, started_at, created_at)
WHERE status = 'draft' AND last_activity_at IS NULL;
