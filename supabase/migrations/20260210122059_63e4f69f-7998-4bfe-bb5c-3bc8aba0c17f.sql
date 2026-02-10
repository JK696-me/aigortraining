
-- 1. Add updated_at to sets
ALTER TABLE public.sets
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Backfill updated_at from created_at
UPDATE public.sets SET updated_at = created_at;

-- 3. Trigger for auto-updating updated_at
CREATE OR REPLACE FUNCTION public.update_sets_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_sets_updated_at
  BEFORE UPDATE ON public.sets
  FOR EACH ROW EXECUTE FUNCTION public.update_sets_updated_at();

-- 4. session_exercises.sort_order NOT NULL with default
ALTER TABLE public.session_exercises ALTER COLUMN sort_order SET DEFAULT 0;
UPDATE public.session_exercises SET sort_order = 0 WHERE sort_order IS NULL;
ALTER TABLE public.session_exercises ALTER COLUMN sort_order SET NOT NULL;

-- 5. Clean duplicate sets: keep the one with the latest created_at
DELETE FROM public.sets
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY session_exercise_id, set_index
      ORDER BY created_at DESC
    ) as rn
    FROM public.sets
  ) ranked WHERE rn > 1
);

-- 6. Clean duplicate session_exercises: keep the one with sets or latest created_at
DELETE FROM public.sets WHERE session_exercise_id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY session_id, exercise_id
      ORDER BY created_at ASC
    ) as rn
    FROM public.session_exercises
  ) ranked WHERE rn > 1
);
DELETE FROM public.session_exercises WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY session_id, exercise_id
      ORDER BY created_at ASC
    ) as rn
    FROM public.session_exercises
  ) ranked WHERE rn > 1
);

-- 7. UNIQUE constraints to enforce invariants
CREATE UNIQUE INDEX idx_sets_se_id_set_index
  ON public.sets (session_exercise_id, set_index);

CREATE UNIQUE INDEX idx_se_session_exercise_unique
  ON public.session_exercises (session_id, exercise_id);

-- 8. Index on sets.updated_at for diagnostics
CREATE INDEX IF NOT EXISTS idx_sets_updated_at ON public.sets (updated_at);
