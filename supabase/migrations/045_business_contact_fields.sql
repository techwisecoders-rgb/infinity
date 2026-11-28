-- 045_business_contact_fields.sql
-- Add phone_number, location, and mail columns to business_profiles.

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS mail TEXT;
