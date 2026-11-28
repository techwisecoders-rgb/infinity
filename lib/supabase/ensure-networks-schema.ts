import { Pool } from "pg";

let schemaEnsuredPromise: Promise<boolean> | null = null;

export function isMissingSchemaError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || "").toLowerCase();
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    code === "42703" ||
    msg.includes("schema cache") ||
    msg.includes("does not exist")
  );
}

const NETWORKS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.networks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'personal',
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  image_url TEXT,
  supporters_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.networks
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'personal';

CREATE INDEX IF NOT EXISTS idx_networks_owner_id ON public.networks(owner_id);
CREATE INDEX IF NOT EXISTS idx_networks_owner_account_type ON public.networks(owner_id, account_type);
CREATE INDEX IF NOT EXISTS idx_networks_username_lower ON public.networks((lower(username)));

CREATE TABLE IF NOT EXISTS public.network_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id UUID NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  recipient_ids JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.network_messages ADD COLUMN IF NOT EXISTS recipient_ids JSONB;

CREATE INDEX IF NOT EXISTS idx_network_messages_network_created
  ON public.network_messages(network_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.network_supporters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id UUID NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (network_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_network_supporters_network_id ON public.network_supporters(network_id);
CREATE INDEX IF NOT EXISTS idx_network_supporters_user_id ON public.network_supporters(user_id);

CREATE TABLE IF NOT EXISTS public.target_supporters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (target_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_target_supporters_target_key ON public.target_supporters(target_key);
CREATE INDEX IF NOT EXISTS idx_target_supporters_user_id ON public.target_supporters(user_id);

ALTER TABLE public.networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_supporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_supporters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "networks_public_read" ON public.networks;
CREATE POLICY "networks_public_read" ON public.networks FOR SELECT USING (true);
DROP POLICY IF EXISTS "networks_owner_insert" ON public.networks;
CREATE POLICY "networks_owner_insert" ON public.networks FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "networks_owner_update" ON public.networks;
CREATE POLICY "networks_owner_update" ON public.networks FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "networks_owner_delete" ON public.networks;
CREATE POLICY "networks_owner_delete" ON public.networks FOR DELETE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "network_messages_public_read" ON public.network_messages;
CREATE POLICY "network_messages_public_read" ON public.network_messages FOR SELECT USING (true);
DROP POLICY IF EXISTS "network_messages_sender_insert" ON public.network_messages;
CREATE POLICY "network_messages_sender_insert" ON public.network_messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
DROP POLICY IF EXISTS "network_messages_sender_delete" ON public.network_messages;
CREATE POLICY "network_messages_sender_delete" ON public.network_messages FOR DELETE USING (auth.uid() = sender_id);

DROP POLICY IF EXISTS "network_supporters_public_read" ON public.network_supporters;
CREATE POLICY "network_supporters_public_read" ON public.network_supporters FOR SELECT USING (true);
DROP POLICY IF EXISTS "network_supporters_owner_insert" ON public.network_supporters;
CREATE POLICY "network_supporters_owner_insert" ON public.network_supporters FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "network_supporters_owner_delete" ON public.network_supporters;
CREATE POLICY "network_supporters_owner_delete" ON public.network_supporters FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "target_supporters_public_read" ON public.target_supporters;
CREATE POLICY "target_supporters_public_read" ON public.target_supporters FOR SELECT USING (true);
DROP POLICY IF EXISTS "target_supporters_owner_insert" ON public.target_supporters;
CREATE POLICY "target_supporters_owner_insert" ON public.target_supporters FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "target_supporters_owner_delete" ON public.target_supporters;
CREATE POLICY "target_supporters_owner_delete" ON public.target_supporters FOR DELETE USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
`;

export async function ensureNetworksSchema(): Promise<boolean> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return false;

  if (!schemaEnsuredPromise) {
    schemaEnsuredPromise = (async () => {
      const pool = new Pool({
        connectionString: dbUrl,
        ssl: dbUrl.includes("localhost") ? false : { rejectUnauthorized: false },
      });
      try {
        await pool.query(NETWORKS_SCHEMA_SQL);
        await new Promise((resolve) => setTimeout(resolve, 450));
        return true;
      } catch (err) {
        console.error("Failed to ensure networks schema:", err);
        schemaEnsuredPromise = null;
        return false;
      } finally {
        await pool.end().catch(() => {});
      }
    })();
  }

  return schemaEnsuredPromise;
}
