-- 039_business_catalog_items.sql
-- Create business_catalog_items table for persisting Business Products, Services, and Vacancies.

CREATE TABLE IF NOT EXISTS public.business_catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('product', 'service', 'vacancy')),
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_catalog_items_user_type
  ON public.business_catalog_items(user_id, item_type, created_at DESC);

ALTER TABLE public.business_catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_catalog_public_read" ON public.business_catalog_items;
CREATE POLICY "business_catalog_public_read"
  ON public.business_catalog_items
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "business_catalog_owner_insert" ON public.business_catalog_items;
CREATE POLICY "business_catalog_owner_insert"
  ON public.business_catalog_items
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "business_catalog_owner_update" ON public.business_catalog_items;
CREATE POLICY "business_catalog_owner_update"
  ON public.business_catalog_items
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "business_catalog_owner_delete" ON public.business_catalog_items;
CREATE POLICY "business_catalog_owner_delete"
  ON public.business_catalog_items
  FOR DELETE
  USING (auth.uid() = user_id);
