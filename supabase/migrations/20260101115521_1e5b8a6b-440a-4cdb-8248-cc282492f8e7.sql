-- Add unique constraint on exercises (user_id, name) to prevent duplicates
ALTER TABLE public.exercises 
ADD CONSTRAINT exercises_user_id_name_unique UNIQUE (user_id, name);