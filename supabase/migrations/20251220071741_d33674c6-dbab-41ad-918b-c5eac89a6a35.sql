-- Create RPC function for undoing workout completion
CREATE OR REPLACE FUNCTION public.undo_complete_session(session_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_record sessions%ROWTYPE;
  result json;
BEGIN
  -- Get the session and verify ownership
  SELECT * INTO session_record
  FROM sessions
  WHERE id = session_id AND user_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
  
  -- Check if session is completed
  IF session_record.status != 'completed' THEN
    RAISE EXCEPTION 'undo_not_available: session is not completed';
  END IF;
  
  -- Check if undo window is still open
  IF session_record.undo_available_until IS NULL OR now() > session_record.undo_available_until THEN
    RAISE EXCEPTION 'undo_not_available: undo window expired';
  END IF;
  
  -- Perform the undo
  UPDATE sessions
  SET 
    status = 'draft',
    completed_at = NULL,
    undo_available_until = NULL,
    timer_running = true,
    timer_last_started_at = now()
  WHERE id = session_id AND user_id = auth.uid()
  RETURNING json_build_object(
    'id', id,
    'status', status,
    'date', date,
    'elapsed_seconds', elapsed_seconds,
    'timer_running', timer_running,
    'timer_last_started_at', timer_last_started_at,
    'template_id', template_id,
    'source', source
  ) INTO result;
  
  RETURN result;
END;
$$;