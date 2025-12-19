-- Add timer and undo fields to sessions table
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS started_at timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS elapsed_seconds integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS timer_running boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS timer_last_started_at timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS undo_available_until timestamp with time zone;