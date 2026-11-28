-- 046_profile_contact_fields.sql
-- Add contact_phone, contact_email, and contact_location columns to profiles.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_location TEXT;
