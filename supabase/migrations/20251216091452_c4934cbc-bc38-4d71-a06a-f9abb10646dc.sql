-- Create RPC function to reset training data for current user
CREATE OR REPLACE FUNCTION public.reset_training_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  -- Get current authenticated user
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete all sessions for user (CASCADE will delete session_exercises and sets)
  DELETE FROM public.sessions WHERE user_id = current_user_id;

  -- Reset exercise_state for user
  UPDATE public.exercise_state
  SET 
    current_working_weight = 0,
    current_sets = base_sets,
    volume_reduce_on = false,
    success_streak = 0,
    fail_streak = 0,
    rep_stage = 1,
    last_target_range = NULL,
    last_recommendation_text = NULL,
    updated_at = now()
  WHERE user_id = current_user_id;
END;
$$;