-- Add rep_stage field to exercise_state
ALTER TABLE public.exercise_state 
ADD COLUMN rep_stage integer NOT NULL DEFAULT 1;