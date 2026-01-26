-- Add canonical_key to exercises for fuzzy matching
ALTER TABLE public.exercises 
ADD COLUMN IF NOT EXISTS canonical_key text;

-- Create index for fast lookups by canonical_key
CREATE INDEX IF NOT EXISTS idx_exercises_canonical_key 
ON public.exercises(user_id, canonical_key) 
WHERE canonical_key IS NOT NULL;

-- Create exercise_aliases table for explicit name mappings
CREATE TABLE IF NOT EXISTS public.exercise_aliases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canonical_key text NOT NULL,
  alias_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, alias_name)
);

-- Create index for fast lookups by alias_name
CREATE INDEX IF NOT EXISTS idx_exercise_aliases_alias_name 
ON public.exercise_aliases(user_id, alias_name);

-- Create index for lookups by canonical_key
CREATE INDEX IF NOT EXISTS idx_exercise_aliases_canonical_key 
ON public.exercise_aliases(user_id, canonical_key);

-- Enable RLS
ALTER TABLE public.exercise_aliases ENABLE ROW LEVEL SECURITY;

-- RLS policies for exercise_aliases
CREATE POLICY "Users can view own aliases" 
ON public.exercise_aliases 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own aliases" 
ON public.exercise_aliases 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own aliases" 
ON public.exercise_aliases 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own aliases" 
ON public.exercise_aliases 
FOR DELETE 
USING (auth.uid() = user_id);

-- Seed common aliases for "Махи с гантелями" variants
-- This will be done per-user when exercises are created