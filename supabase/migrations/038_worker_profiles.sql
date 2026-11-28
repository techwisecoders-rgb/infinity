-- 038_worker_profiles.sql
-- Create worker_profiles table for persisting all editable Work page inputs in Supabase.

CREATE TABLE IF NOT EXISTS public.worker_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT,
  location TEXT,
  qualification TEXT,
  experience TEXT,
  profession TEXT,
  profile_image TEXT,
  background_image TEXT,
  work_available BOOLEAN NOT NULL DEFAULT TRUE,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.worker_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "worker_profiles_public_read" ON public.worker_profiles;
CREATE POLICY "worker_profiles_public_read"
  ON public.worker_profiles
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "worker_profiles_owner_insert" ON public.worker_profiles;
CREATE POLICY "worker_profiles_owner_insert"
  ON public.worker_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "worker_profiles_owner_update" ON public.worker_profiles;
CREATE POLICY "worker_profiles_owner_update"
  ON public.worker_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "worker_profiles_owner_delete" ON public.worker_profiles;
CREATE POLICY "worker_profiles_owner_delete"
  ON public.worker_profiles
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_worker_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_worker_profiles_updated_at ON public.worker_profiles;
CREATE TRIGGER trigger_worker_profiles_updated_at
  BEFORE UPDATE ON public.worker_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_worker_profiles_updated_at();
