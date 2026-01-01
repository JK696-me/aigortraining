-- Create seed_templates table (global catalog, not user-specific)
CREATE TABLE public.seed_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  title_ru text NOT NULL,
  description_ru text
);

-- Create seed_template_items table
CREATE TABLE public.seed_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_template_id uuid NOT NULL REFERENCES public.seed_templates(id) ON DELETE CASCADE,
  exercise_name_ru text NOT NULL,
  sort_order integer NOT NULL,
  target_sets integer NOT NULL DEFAULT 3
);

-- Add seed_key to workout_templates for duplicate prevention
ALTER TABLE public.workout_templates 
ADD COLUMN seed_key text;

-- Add unique constraint for seed_key per user (only when seed_key is not null)
CREATE UNIQUE INDEX workout_templates_user_seed_key_unique 
ON public.workout_templates (user_id, seed_key) 
WHERE seed_key IS NOT NULL;

-- Allow public read access to seed tables (they're global catalogs)
ALTER TABLE public.seed_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seed_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read seed_templates" ON public.seed_templates
FOR SELECT USING (true);

CREATE POLICY "Anyone can read seed_template_items" ON public.seed_template_items
FOR SELECT USING (true);

-- Insert the 4 seed templates
INSERT INTO public.seed_templates (key, title_ru, description_ru) VALUES
('chest', 'Грудь', 'Тренировка на грудные мышцы + бицепс, плечи, трицепс'),
('back', 'Спина', 'Тренировка на спину + бицепс, плечи, трицепс'),
('legs', 'Ноги', 'Тренировка на ноги и ягодицы + бицепс, плечи, трицепс'),
('fullbody', 'Фулбади', 'Полная тренировка всего тела');

-- Insert template items for Chest template
INSERT INTO public.seed_template_items (seed_template_id, exercise_name_ru, sort_order, target_sets)
SELECT id, exercise_name, sort_order, 3
FROM public.seed_templates, 
(VALUES 
  ('Жим штанги лёжа', 1),
  ('Жим гантелей на наклонной скамье', 2),
  ('Сведение в кроссовере (среднее положение)', 3),
  ('Подъём гантелей на бицепс', 4),
  ('Махи гантелями', 5),
  ('Разгибание на трицепс в кроссовере', 6)
) AS items(exercise_name, sort_order)
WHERE key = 'chest';

-- Insert template items for Back template
INSERT INTO public.seed_template_items (seed_template_id, exercise_name_ru, sort_order, target_sets)
SELECT id, exercise_name, sort_order, 3
FROM public.seed_templates, 
(VALUES 
  ('Тяга верхнего блока', 1),
  ('Тяга среднего блока', 2),
  ('Тяга штанги в наклоне', 3),
  ('Подъём штанги на бицепс', 4),
  ('Разведение на заднюю дельту в бабочке', 5),
  ('Разгибание на трицепс в кроссовере', 6)
) AS items(exercise_name, sort_order)
WHERE key = 'back';

-- Insert template items for Legs template
INSERT INTO public.seed_template_items (seed_template_id, exercise_name_ru, sort_order, target_sets)
SELECT id, exercise_name, sort_order, 3
FROM public.seed_templates, 
(VALUES 
  ('Приседание', 1),
  ('Гак-приседания', 2),
  ('Ягодичный мост со штангой', 3),
  ('Подъём гантелей на бицепс', 4),
  ('Протяжка гантелей', 5),
  ('Разгибание на трицепс в кроссовере', 6)
) AS items(exercise_name, sort_order)
WHERE key = 'legs';

-- Insert template items for Fullbody template
INSERT INTO public.seed_template_items (seed_template_id, exercise_name_ru, sort_order, target_sets)
SELECT id, exercise_name, sort_order, 3
FROM public.seed_templates, 
(VALUES 
  ('Приседание', 1),
  ('Жим штанги лёжа', 2),
  ('Тяга верхнего блока', 3),
  ('Ягодичный мост в тренажёре', 4),
  ('Подъём гантелей на бицепс', 5),
  ('Махи гантелями', 6),
  ('Разгибание на трицепс в кроссовере', 7)
) AS items(exercise_name, sort_order)
WHERE key = 'fullbody';