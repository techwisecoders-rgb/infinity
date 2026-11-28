-- 030_user_credentials_bcrypt.sql
-- Store bcrypt password hashes securely (service_role only) and provide
-- service_role-only auth lookup helpers for 2-step OTP login/registration.

CREATE TABLE IF NOT EXISTS public.user_credentials (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  hash_algorithm TEXT NOT NULL DEFAULT 'bcrypt',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;

-- Ensure no public, anon, or authenticated client can read or mutate password hashes directly.
REVOKE ALL ON TABLE public.user_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_credentials TO service_role;

CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.is_email_registered(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE lower(email) = lower(trim(p_email))
      AND email_confirmed_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_email_registered(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_registered(TEXT) TO service_role;
