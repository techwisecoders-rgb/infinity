-- 031_otp_codes_and_pgcrypto_bcrypt.sql
-- Add pgcrypto bcrypt RPC helpers and 6-digit OTP verification table.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.save_user_bcrypt_password(
  p_user_id UUID,
  p_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO public.user_credentials (user_id, password_hash, hash_algorithm, updated_at)
  VALUES (p_user_id, crypt(p_password, gen_salt('bf', 12)), 'bcrypt', NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET password_hash = crypt(p_password, gen_salt('bf', 12)),
        hash_algorithm = 'bcrypt',
        updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.save_user_bcrypt_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_user_bcrypt_password(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.verify_user_bcrypt_password(
  p_user_id UUID,
  p_password TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    (
      SELECT password_hash = crypt(p_password, password_hash)
      FROM public.user_credentials
      WHERE user_id = p_user_id
    ),
    FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.verify_user_bcrypt_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_user_bcrypt_password(UUID, TEXT) TO service_role;

CREATE TABLE IF NOT EXISTS public.otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_email_purpose_created
  ON public.otp_codes (lower(email), purpose, created_at DESC);

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.otp_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.otp_codes TO service_role;
