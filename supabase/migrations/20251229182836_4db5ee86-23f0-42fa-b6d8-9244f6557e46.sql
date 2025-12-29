-- Add active_set_index to session_exercises for tracking current set
ALTER TABLE public.session_exercises 
ADD COLUMN active_set_index integer DEFAULT NULL;