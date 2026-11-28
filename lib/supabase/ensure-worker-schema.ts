import { Client } from "pg";

let ensureWorkerSchemaPromise: Promise<boolean> | null = null;

export function isMissingWorkerSchemaError(
  error: { message?: string; code?: string } | null | undefined
): boolean {
  if (!error) return false;
  const msg = String(error.message ?? "");
  const code = String(error.code ?? "");
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    code === "42703" ||
    msg.includes("schema cache") ||
    msg.includes("does not exist") ||
    msg.includes("Could not find the table")
  );
}

export async function ensureWorkerSchema(): Promise<boolean> {
  if (ensureWorkerSchemaPromise) {
    return ensureWorkerSchemaPromise;
  }

  ensureWorkerSchemaPromise = (async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return false;
    }

    const client = new Client({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
    });

    try {
      await client.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.worker_profiles (
          user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
          name TEXT,
          phone TEXT,
          location TEXT,
          qualification TEXT,
          experience TEXT,
          profession TEXT,
          profile_image TEXT,
          background_image TEXT,
          work_available BOOLEAN NOT NULL DEFAULT TRUE,
          skills JSONB NOT NULL DEFAULT '[]'::jsonb,
          sections JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE public.worker_profiles ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "worker_profiles_public_read" ON public.worker_profiles;
        CREATE POLICY "worker_profiles_public_read"
          ON public.worker_profiles
          FOR SELECT
          USING (true);

        DROP POLICY IF EXISTS "worker_profiles_owner_insert" ON public.worker_profiles;
        CREATE POLICY "worker_profiles_owner_insert"
          ON public.worker_profiles
          FOR INSERT
          WITH CHECK (auth.uid() = user_id);

        DROP POLICY IF EXISTS "worker_profiles_owner_update" ON public.worker_profiles;
        CREATE POLICY "worker_profiles_owner_update"
          ON public.worker_profiles
          FOR UPDATE
          USING (auth.uid() = user_id)
          WITH CHECK (auth.uid() = user_id);

        DROP POLICY IF EXISTS "worker_profiles_owner_delete" ON public.worker_profiles;
        CREATE POLICY "worker_profiles_owner_delete"
          ON public.worker_profiles
          FOR DELETE
          USING (auth.uid() = user_id);

        NOTIFY pgrst, 'reload schema';
      `);
      return true;
    } catch {
      return false;
    } finally {
      await client.end().catch(() => {});
      ensureWorkerSchemaPromise = null;
    }
  })();

  return ensureWorkerSchemaPromise;
}
