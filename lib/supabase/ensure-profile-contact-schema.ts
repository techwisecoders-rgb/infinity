import { Pool } from "pg";

let profileContactSchemaPromise: Promise<boolean> | null = null;

export function isMissingProfileContactSchemaError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || "").toLowerCase();
  return (
    code === "42703" ||
    msg.includes("contact_phone") ||
    msg.includes("contact_email") ||
    msg.includes("contact_location") ||
    msg.includes("schema cache")
  );
}

const PROFILE_CONTACT_SCHEMA_SQL = `
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_location TEXT;
`;

export async function ensureProfileContactSchema(): Promise<boolean> {
  if (profileContactSchemaPromise) return profileContactSchemaPromise;

  profileContactSchemaPromise = (async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return false;
    const pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await pool.query(PROFILE_CONTACT_SCHEMA_SQL);
      return true;
    } catch (err) {
      console.error("[ensureProfileContactSchema] Failed:", err);
      return false;
    } finally {
      await pool.end().catch(() => {});
    }
  })();

  const ok = await profileContactSchemaPromise;
  if (!ok) profileContactSchemaPromise = null;
  return ok;
}
