-- Таблица настроек пользователя
CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  barbell_increment numeric NOT NULL DEFAULT 5,
  dumbbells_increment numeric NOT NULL DEFAULT 2,
  machine_increment numeric NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Включаем RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Политики для user_settings
CREATE POLICY "Users can view own settings" ON public.user_settings 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON public.user_settings 
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.user_settings 
  FOR UPDATE USING (auth.uid() = user_id);

-- Индекс
CREATE INDEX idx_user_settings_user_id ON public.user_settings(user_id);

-- Триггер для автосоздания настроек при регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id) VALUES (new.id);
  INSERT INTO public.user_settings (user_id) VALUES (new.id);
  RETURN new;
END;
$$;

-- Функция для автосоздания exercise_state при создании упражнения
CREATE OR REPLACE FUNCTION public.handle_new_exercise()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.exercise_state (user_id, exercise_id)
  VALUES (NEW.user_id, NEW.id)
  ON CONFLICT (user_id, exercise_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Триггер для автосоздания exercise_state
CREATE TRIGGER on_exercise_created
  AFTER INSERT ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_exercise();