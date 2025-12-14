-- Добавляем поля status и completed_at в sessions
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Индекс для быстрой выборки завершённых тренировок
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_completed_at ON public.sessions(completed_at);