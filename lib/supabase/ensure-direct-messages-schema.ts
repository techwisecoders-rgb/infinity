import { Pool } from "pg";

let dmSchemaEnsuredPromise: Promise<boolean> | null = null;

export function isMissingDmSchemaError(err: { code?: string; message?: string } | null | undefined): boolean {
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

const DM_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_pair_created
  ON public.direct_messages(sender_id, recipient_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient_created
  ON public.direct_messages(recipient_id, sender_id, created_at ASC);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "direct_messages_involved_read" ON public.direct_messages;
CREATE POLICY "direct_messages_involved_read" ON public.direct_messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "direct_messages_sender_insert" ON public.direct_messages;
CREATE POLICY "direct_messages_sender_insert" ON public.direct_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);
`;

export async function ensureDirectMessagesSchema(): Promise<boolean> {
  if (dmSchemaEnsuredPromise) return dmSchemaEnsuredPromise;

  dmSchemaEnsuredPromise = (async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return false;
    const pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await pool.query(DM_SCHEMA_SQL);
      return true;
    } catch (err) {
      console.error("[ensureDirectMessagesSchema] Failed:", err);
      return false;
    } finally {
      await pool.end().catch(() => {});
    }
  })();

  const ok = await dmSchemaEnsuredPromise;
  if (!ok) dmSchemaEnsuredPromise = null;
  return ok;
}
