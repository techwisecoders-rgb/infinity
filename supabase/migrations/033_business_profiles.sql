-- 033_business_profiles.sql
-- Create business_profiles table for persisting all editable business profile sections in Supabase.

CREATE TABLE IF NOT EXISTS public.business_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  banner_url TEXT,
  business_name TEXT,
  tagline TEXT,
  about_business TEXT,
  about_owner TEXT,
  working_hours_weekday TEXT,
  working_hours_sunday TEXT,
  listings JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery_places JSONB NOT NULL DEFAULT '[]'::jsonb,
  social_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  rating_score TEXT,
  review_count_text TEXT,
  reviews JSONB NOT NULL DEFAULT '[]'::jsonb,
  staff_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_profiles_public_read" ON public.business_profiles;
CREATE POLICY "business_profiles_public_read"
  ON public.business_profiles
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "business_profiles_owner_insert" ON public.business_profiles;
CREATE POLICY "business_profiles_owner_insert"
  ON public.business_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "business_profiles_owner_update" ON public.business_profiles;
CREATE POLICY "business_profiles_owner_update"
  ON public.business_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "business_profiles_owner_delete" ON public.business_profiles;
CREATE POLICY "business_profiles_owner_delete"
  ON public.business_profiles
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_business_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_business_profiles_updated_at ON public.business_profiles;
CREATE TRIGGER trigger_business_profiles_updated_at
  BEFORE UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_business_profiles_updated_at();
