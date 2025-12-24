-- Add indexes for faster history queries

-- Index for sessions list (user_id + status + completed_at for pagination)
CREATE INDEX IF NOT EXISTS idx_sessions_user_status_completed 
ON public.sessions (user_id, status, completed_at DESC);

-- Index for session_exercises by session_id for batch loading
CREATE INDEX IF NOT EXISTS idx_session_exercises_session_id 
ON public.session_exercises (session_id);

-- Index for sets by session_exercise_id and set_index
CREATE INDEX IF NOT EXISTS idx_sets_session_exercise_id 
ON public.sets (session_exercise_id, set_index);