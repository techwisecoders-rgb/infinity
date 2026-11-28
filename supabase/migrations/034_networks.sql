-- 034_networks.sql
-- Create networks and network_messages tables for persisting Build Network and Network Chat in Supabase.

CREATE TABLE IF NOT EXISTS public.networks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  image_url TEXT,
  supporters_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_networks_owner_id ON public.networks(owner_id);
CREATE INDEX IF NOT EXISTS idx_networks_username_lower ON public.networks((lower(username)));

CREATE TABLE IF NOT EXISTS public.network_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id UUID NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_network_messages_network_created
  ON public.network_messages(network_id, created_at ASC);

ALTER TABLE public.networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "networks_public_read" ON public.networks;
CREATE POLICY "networks_public_read"
  ON public.networks
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "networks_owner_insert" ON public.networks;
CREATE POLICY "networks_owner_insert"
  ON public.networks
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "networks_owner_update" ON public.networks;
CREATE POLICY "networks_owner_update"
  ON public.networks
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "networks_owner_delete" ON public.networks;
CREATE POLICY "networks_owner_delete"
  ON public.networks
  FOR DELETE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "network_messages_public_read" ON public.network_messages;
CREATE POLICY "network_messages_public_read"
  ON public.network_messages
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "network_messages_sender_insert" ON public.network_messages;
CREATE POLICY "network_messages_sender_insert"
  ON public.network_messages
  FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "network_messages_sender_delete" ON public.network_messages;
CREATE POLICY "network_messages_sender_delete"
  ON public.network_messages
  FOR DELETE
  USING (auth.uid() = sender_id);

CREATE OR REPLACE FUNCTION public.set_networks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_networks_updated_at ON public.networks;
CREATE TRIGGER trigger_networks_updated_at
  BEFORE UPDATE ON public.networks
  FOR EACH ROW EXECUTE FUNCTION public.set_networks_updated_at();
