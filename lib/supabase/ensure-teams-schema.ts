import { Pool } from "pg";

let teamSchemaEnsuredPromise: Promise<boolean> | null = null;

export function isMissingTeamSchemaError(err: { code?: string; message?: string } | null | undefined): boolean {
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

const TEAMS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'personal',
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON public.teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_username_lower ON public.teams((lower(username)));

CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  username TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_status ON public.team_members(user_id, status);

CREATE TABLE IF NOT EXISTS public.team_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_messages_team_created
  ON public.team_messages(team_id, created_at ASC);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teams_involved_read" ON public.teams;
CREATE POLICY "teams_involved_read" ON public.teams
  FOR SELECT USING (
    auth.uid() = owner_id OR
    EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = id AND tm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "teams_owner_insert" ON public.teams;
CREATE POLICY "teams_owner_insert" ON public.teams
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "teams_owner_update" ON public.teams;
CREATE POLICY "teams_owner_update" ON public.teams
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "teams_owner_delete" ON public.teams;
CREATE POLICY "teams_owner_delete" ON public.teams
  FOR DELETE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "team_members_involved_read" ON public.team_members;
CREATE POLICY "team_members_involved_read" ON public.team_members
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "team_messages_accepted_read" ON public.team_messages;
CREATE POLICY "team_messages_accepted_read" ON public.team_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_id AND tm.user_id = auth.uid() AND tm.status = 'accepted')
  );

DROP POLICY IF EXISTS "team_messages_accepted_insert" ON public.team_messages;
CREATE POLICY "team_messages_accepted_insert" ON public.team_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND (
      EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_id AND tm.user_id = auth.uid() AND tm.status = 'accepted')
    )
  );
`;

export async function ensureTeamsSchema(): Promise<boolean> {
  if (teamSchemaEnsuredPromise) return teamSchemaEnsuredPromise;

  teamSchemaEnsuredPromise = (async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return false;
    const pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await pool.query(TEAMS_SCHEMA_SQL);
      return true;
    } catch (err) {
      console.error("[ensureTeamsSchema] Failed:", err);
      return false;
    } finally {
      await pool.end().catch(() => {});
    }
  })();

  const ok = await teamSchemaEnsuredPromise;
  if (!ok) teamSchemaEnsuredPromise = null;
  return ok;
}
