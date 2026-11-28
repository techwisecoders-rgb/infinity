import { Pool } from "pg";

let myselfSchemaEnsuredPromise: Promise<boolean> | null = null;

export function isMissingMyselfSchemaError(err: { code?: string; message?: string } | null | undefined): boolean {
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

const MYSELF_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.myself_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'personal',
  item_type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  file_name TEXT,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_myself_items_owner_created
  ON public.myself_items(owner_id, account_type, created_at ASC);

ALTER TABLE public.myself_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "myself_items_owner_read" ON public.myself_items;
CREATE POLICY "myself_items_owner_read" ON public.myself_items
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "myself_items_owner_insert" ON public.myself_items;
CREATE POLICY "myself_items_owner_insert" ON public.myself_items
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "myself_items_owner_delete" ON public.myself_items;
CREATE POLICY "myself_items_owner_delete" ON public.myself_items
  FOR DELETE USING (auth.uid() = owner_id);
`;

export async function ensureMyselfSchema(): Promise<boolean> {
  if (myselfSchemaEnsuredPromise) return myselfSchemaEnsuredPromise;

  myselfSchemaEnsuredPromise = (async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return false;
    const pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await pool.query(MYSELF_SCHEMA_SQL);
      return true;
    } catch (err) {
      console.error("[ensureMyselfSchema] Failed:", err);
      return false;
    } finally {
      await pool.end().catch(() => {});
    }
  })();

  const ok = await myselfSchemaEnsuredPromise;
  if (!ok) myselfSchemaEnsuredPromise = null;
  return ok;
}
