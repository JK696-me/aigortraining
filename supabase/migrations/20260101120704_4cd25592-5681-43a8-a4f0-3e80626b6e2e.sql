-- Create onboarding_state table
CREATE TABLE public.onboarding_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_seen_at timestamp with time zone,
  intro_completed_at timestamp with time zone,
  intro_dismissed boolean NOT NULL DEFAULT false,
  seed_done boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.onboarding_state ENABLE ROW LEVEL SECURITY;

-- RLS policies - only own user_id
CREATE POLICY "Users can view own onboarding state"
  ON public.onboarding_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own onboarding state"
  ON public.onboarding_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own onboarding state"
  ON public.onboarding_state FOR UPDATE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_onboarding_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_onboarding_state_updated_at
  BEFORE UPDATE ON public.onboarding_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_onboarding_state_updated_at();