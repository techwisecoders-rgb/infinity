import { Client } from "pg";

let ensureBusinessCatalogPromise: Promise<boolean> | null = null;

export function isMissingBusinessCatalogError(
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

export async function ensureBusinessCatalogSchema(): Promise<boolean> {
  if (ensureBusinessCatalogPromise) {
    return ensureBusinessCatalogPromise;
  }

  ensureBusinessCatalogPromise = (async () => {
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
        CREATE TABLE IF NOT EXISTS public.business_catalog_items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
          item_type TEXT NOT NULL CHECK (item_type IN ('product', 'service', 'vacancy')),
          title TEXT NOT NULL,
          subtitle TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          image_url TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_business_catalog_items_user_type
          ON public.business_catalog_items(user_id, item_type, created_at DESC);

        ALTER TABLE public.business_catalog_items ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "business_catalog_public_read" ON public.business_catalog_items;
        CREATE POLICY "business_catalog_public_read"
          ON public.business_catalog_items
          FOR SELECT
          USING (true);

        DROP POLICY IF EXISTS "business_catalog_owner_insert" ON public.business_catalog_items;
        CREATE POLICY "business_catalog_owner_insert"
          ON public.business_catalog_items
          FOR INSERT
          WITH CHECK (auth.uid() = user_id);

        DROP POLICY IF EXISTS "business_catalog_owner_update" ON public.business_catalog_items;
        CREATE POLICY "business_catalog_owner_update"
          ON public.business_catalog_items
          FOR UPDATE
          USING (auth.uid() = user_id)
          WITH CHECK (auth.uid() = user_id);

        DROP POLICY IF EXISTS "business_catalog_owner_delete" ON public.business_catalog_items;
        CREATE POLICY "business_catalog_owner_delete"
          ON public.business_catalog_items
          FOR DELETE
          USING (auth.uid() = user_id);

        NOTIFY pgrst, 'reload schema';
      `);
      return true;
    } catch {
      return false;
    } finally {
      await client.end().catch(() => {});
      ensureBusinessCatalogPromise = null;
    }
  })();

  return ensureBusinessCatalogPromise;
}
