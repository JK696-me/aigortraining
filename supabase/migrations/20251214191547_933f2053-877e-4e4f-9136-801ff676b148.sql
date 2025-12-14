-- Таблица пользователей (profiles)
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Упражнения
CREATE TABLE public.exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type int NOT NULL CHECK (type >= 1 AND type <= 4),
  increment_kind text NOT NULL CHECK (increment_kind IN ('barbell', 'dumbbells', 'machine')),
  increment_value numeric NOT NULL,
  is_dumbbell_pair bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Шаблоны тренировок
CREATE TABLE public.workout_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Элементы шаблонов
CREATE TABLE public.template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  target_sets int NOT NULL,
  sort_order int NOT NULL
);

-- Тренировочные сессии
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('empty', 'repeat', 'template')),
  template_id uuid REFERENCES public.workout_templates(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Упражнения в сессии
CREATE TABLE public.session_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  rpe numeric CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10)),
  performed_sets_count int,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Подходы
CREATE TABLE public.sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_exercise_id uuid NOT NULL REFERENCES public.session_exercises(id) ON DELETE CASCADE,
  set_index int NOT NULL,
  weight numeric NOT NULL,
  reps int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Состояние упражнения (прогресс пользователя)
CREATE TABLE public.exercise_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  current_working_weight numeric NOT NULL DEFAULT 0,
  base_sets int NOT NULL DEFAULT 3,
  current_sets int NOT NULL DEFAULT 3,
  volume_reduce_on bool NOT NULL DEFAULT false,
  success_streak int NOT NULL DEFAULT 0,
  fail_streak int NOT NULL DEFAULT 0,
  last_target_range text,
  last_recommendation_text text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exercise_id)
);

-- Индексы
CREATE INDEX idx_exercises_user_id ON public.exercises(user_id);
CREATE INDEX idx_workout_templates_user_id ON public.workout_templates(user_id);
CREATE INDEX idx_template_items_template_id ON public.template_items(template_id);
CREATE INDEX idx_template_items_exercise_id ON public.template_items(exercise_id);
CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_template_id ON public.sessions(template_id);
CREATE INDEX idx_session_exercises_session_id ON public.session_exercises(session_id);
CREATE INDEX idx_session_exercises_exercise_id ON public.session_exercises(exercise_id);
CREATE INDEX idx_sets_session_exercise_id ON public.sets(session_exercise_id);
CREATE INDEX idx_exercise_state_user_id ON public.exercise_state(user_id);
CREATE INDEX idx_exercise_state_exercise_id ON public.exercise_state(exercise_id);

-- Включаем RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_state ENABLE ROW LEVEL SECURITY;

-- RLS политики для users
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- RLS политики для exercises
CREATE POLICY "Users can view own exercises" ON public.exercises FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own exercises" ON public.exercises FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own exercises" ON public.exercises FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own exercises" ON public.exercises FOR DELETE USING (auth.uid() = user_id);

-- RLS политики для workout_templates
CREATE POLICY "Users can view own templates" ON public.workout_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own templates" ON public.workout_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates" ON public.workout_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates" ON public.workout_templates FOR DELETE USING (auth.uid() = user_id);

-- RLS политики для template_items (через workout_templates)
CREATE POLICY "Users can view own template items" ON public.template_items FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.workout_templates WHERE id = template_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert own template items" ON public.template_items FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.workout_templates WHERE id = template_id AND user_id = auth.uid()));
CREATE POLICY "Users can update own template items" ON public.template_items FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM public.workout_templates WHERE id = template_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete own template items" ON public.template_items FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.workout_templates WHERE id = template_id AND user_id = auth.uid()));

-- RLS политики для sessions
CREATE POLICY "Users can view own sessions" ON public.sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON public.sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON public.sessions FOR DELETE USING (auth.uid() = user_id);

-- RLS политики для session_exercises (через sessions)
CREATE POLICY "Users can view own session exercises" ON public.session_exercises FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert own session exercises" ON public.session_exercises FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND user_id = auth.uid()));
CREATE POLICY "Users can update own session exercises" ON public.session_exercises FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete own session exercises" ON public.session_exercises FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND user_id = auth.uid()));

-- RLS политики для sets (через session_exercises -> sessions)
CREATE POLICY "Users can view own sets" ON public.sets FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.session_exercises se 
    JOIN public.sessions s ON se.session_id = s.id 
    WHERE se.id = session_exercise_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "Users can insert own sets" ON public.sets FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.session_exercises se 
    JOIN public.sessions s ON se.session_id = s.id 
    WHERE se.id = session_exercise_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "Users can update own sets" ON public.sets FOR UPDATE 
  USING (EXISTS (
    SELECT 1 FROM public.session_exercises se 
    JOIN public.sessions s ON se.session_id = s.id 
    WHERE se.id = session_exercise_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "Users can delete own sets" ON public.sets FOR DELETE 
  USING (EXISTS (
    SELECT 1 FROM public.session_exercises se 
    JOIN public.sessions s ON se.session_id = s.id 
    WHERE se.id = session_exercise_id AND s.user_id = auth.uid()
  ));

-- RLS политики для exercise_state
CREATE POLICY "Users can view own exercise state" ON public.exercise_state FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own exercise state" ON public.exercise_state FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own exercise state" ON public.exercise_state FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own exercise state" ON public.exercise_state FOR DELETE USING (auth.uid() = user_id);

-- Функция для автоматического создания профиля при регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id) VALUES (new.id);
  RETURN new;
END;
$$;

-- Триггер для создания профиля
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();