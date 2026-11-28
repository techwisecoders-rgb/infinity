import { Pool } from "pg";

let repostSchemaEnsuredPromise: Promise<boolean> | null = null;

export function isMissingRepostSchemaError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || "").toLowerCase();
  return code === "42703" || msg.includes("reposted_post_id") || msg.includes("schema cache");
}

const REPOST_SCHEMA_SQL = `
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS reposted_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_reposted_post_id ON public.posts(reposted_post_id);
`;

export async function ensureRepostSchema(): Promise<boolean> {
  if (repostSchemaEnsuredPromise) return repostSchemaEnsuredPromise;

  repostSchemaEnsuredPromise = (async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return false;
    const pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await pool.query(REPOST_SCHEMA_SQL);
      return true;
    } catch (err) {
      console.error("[ensureRepostSchema] Failed:", err);
      return false;
    } finally {
      await pool.end().catch(() => {});
    }
  })();

  const ok = await repostSchemaEnsuredPromise;
  if (!ok) repostSchemaEnsuredPromise = null;
  return ok;
}
