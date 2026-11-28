-- 035_network_supporters.sql
-- Track unique mail account supporters per network and keep supporters_count in sync.

CREATE TABLE IF NOT EXISTS public.network_supporters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id UUID NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (network_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_network_supporters_network_id
  ON public.network_supporters(network_id);

CREATE INDEX IF NOT EXISTS idx_network_supporters_user_id
  ON public.network_supporters(user_id);

ALTER TABLE public.network_supporters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "network_supporters_public_read" ON public.network_supporters;
CREATE POLICY "network_supporters_public_read"
  ON public.network_supporters
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "network_supporters_owner_insert" ON public.network_supporters;
CREATE POLICY "network_supporters_owner_insert"
  ON public.network_supporters
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "network_supporters_owner_delete" ON public.network_supporters;
CREATE POLICY "network_supporters_owner_delete"
  ON public.network_supporters
  FOR DELETE
  USING (auth.uid() = user_id);
