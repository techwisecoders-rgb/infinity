import { Pool } from "pg";

let bizContactSchemaPromise: Promise<boolean> | null = null;

export function isMissingBusinessContactSchemaError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || "").toLowerCase();
  return (
    code === "42703" ||
    msg.includes("phone_number") ||
    msg.includes("location") ||
    msg.includes("mail") ||
    msg.includes("schema cache")
  );
}

const BIZ_CONTACT_SCHEMA_SQL = `
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS mail TEXT;
`;

export async function ensureBusinessContactSchema(): Promise<boolean> {
  if (bizContactSchemaPromise) return bizContactSchemaPromise;

  bizContactSchemaPromise = (async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return false;
    const pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await pool.query(BIZ_CONTACT_SCHEMA_SQL);
      return true;
    } catch (err) {
      console.error("[ensureBusinessContactSchema] Failed:", err);
      return false;
    } finally {
      await pool.end().catch(() => {});
    }
  })();

  const ok = await bizContactSchemaPromise;
  if (!ok) bizContactSchemaPromise = null;
  return ok;
}
