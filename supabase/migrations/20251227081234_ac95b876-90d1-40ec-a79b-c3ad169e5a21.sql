-- Create health_entries table
CREATE TABLE public.health_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  weight_kg NUMERIC,
  shoulders_cm NUMERIC,
  chest_cm NUMERIC,
  biceps_cm NUMERIC,
  waist_cm NUMERIC,
  sides_cm NUMERIC,
  glutes_cm NUMERIC,
  thighs_cm NUMERIC,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Enable RLS on health_entries
ALTER TABLE public.health_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for health_entries
CREATE POLICY "Users can view own health entries"
ON public.health_entries FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health entries"
ON public.health_entries FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health entries"
ON public.health_entries FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own health entries"
ON public.health_entries FOR DELETE
USING (auth.uid() = user_id);

-- Create health_attachments table
CREATE TABLE public.health_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  health_entry_id UUID NOT NULL REFERENCES public.health_entries(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on health_attachments
ALTER TABLE public.health_attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies for health_attachments
CREATE POLICY "Users can view own health attachments"
ON public.health_attachments FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health attachments"
ON public.health_attachments FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health attachments"
ON public.health_attachments FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own health attachments"
ON public.health_attachments FOR DELETE
USING (auth.uid() = user_id);

-- Create storage bucket for InBody photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('inbody', 'inbody', true);

-- Storage policies for inbody bucket
CREATE POLICY "Users can view own inbody photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'inbody' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own inbody photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'inbody' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own inbody photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'inbody' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own inbody photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'inbody' AND auth.uid()::text = (storage.foldername(name))[1]);