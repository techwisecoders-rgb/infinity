-- 036_target_supporters.sql
-- Track unique mail account supporters for any post author / profile target across home and feeds.

CREATE TABLE IF NOT EXISTS public.target_supporters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (target_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_target_supporters_target_key
  ON public.target_supporters(target_key);

CREATE INDEX IF NOT EXISTS idx_target_supporters_user_id
  ON public.target_supporters(user_id);

ALTER TABLE public.target_supporters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "target_supporters_public_read" ON public.target_supporters;
CREATE POLICY "target_supporters_public_read"
  ON public.target_supporters
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "target_supporters_owner_insert" ON public.target_supporters;
CREATE POLICY "target_supporters_owner_insert"
  ON public.target_supporters
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "target_supporters_owner_delete" ON public.target_supporters;
CREATE POLICY "target_supporters_owner_delete"
  ON public.target_supporters
  FOR DELETE
  USING (auth.uid() = user_id);
