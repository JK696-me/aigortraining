-- Add rpe field to sets table (per-set RPE instead of per-exercise)
ALTER TABLE public.sets 
ADD COLUMN rpe integer NULL;

-- Add check constraint for valid RPE range (1-10)
ALTER TABLE public.sets
ADD CONSTRAINT sets_rpe_range CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10));