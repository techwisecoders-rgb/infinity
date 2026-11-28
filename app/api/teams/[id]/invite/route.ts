import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureTeamsSchema, isMissingTeamSchemaError } from "@/lib/supabase/ensure-teams-schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeHandle(value: unknown): string {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
  return cleaned ? `@${cleaned}` : "";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: teamId } = await context.params;
  if (!UUID_RE.test(teamId)) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_ID", message: "Invalid team id" } },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: { usernames?: string[]; user_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_JSON", message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const userIdParam = String(body.user_id ?? "").trim();
  const effectiveUserId = UUID_RE.test(userIdParam) ? userIdParam : (user?.id || "");
  if (!effectiveUserId) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Please log in first" } },
      { status: 401 }
    );
  }

  const admin = createAdminClient();
  let { data: team, error: teamErr } = await admin
    .from("teams")
    .select("id, owner_id")
    .eq("id", teamId)
    .maybeSingle();

  if (isMissingTeamSchemaError(teamErr) && (await ensureTeamsSchema())) {
    ({ data: team, error: teamErr } = await admin
      .from("teams")
      .select("id, owner_id")
      .eq("id", teamId)
      .maybeSingle());
  }

  if (teamErr || !team) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Team not found" } },
      { status: 404 }
    );
  }

  if (String(team.owner_id) !== String(effectiveUserId)) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Only the team owner can invite members" } },
      { status: 403 }
    );
  }

  const rawInvites = Array.isArray(body.usernames) ? body.usernames : [];
  const handles = Array.from(new Set(rawInvites.map(normalizeHandle).filter(Boolean)));
  if (handles.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Provide at least one @username" } },
      { status: 400 }
    );
  }

  const { data: allProfiles } = await admin.from("profiles").select("id, username");
  const profileByHandle = new Map<string, { id: string; username: string }>();
  for (const p of allProfiles ?? []) {
    const h = normalizeHandle(p.username);
    if (h) profileByHandle.set(h, { id: String(p.id), username: h });
  }

  const { data: existingMembers } = await admin
    .from("team_members")
    .select("user_id, status")
    .eq("team_id", teamId);
  const existingStatus = new Map<string, string>();
  for (const m of existingMembers ?? []) {
    existingStatus.set(String(m.user_id), String(m.status));
  }

  const invited: string[] = [];
  const notFound: string[] = [];

  for (const handle of handles) {
    const match = profileByHandle.get(handle);
    if (!match) {
      notFound.push(handle);
      continue;
    }
    if (match.id === effectiveUserId) continue;
    if (existingStatus.get(match.id) === "accepted") continue;

    await admin.from("team_members").upsert(
      {
        team_id: teamId,
        user_id: match.id,
        username: match.username,
        role: "member",
        status: "pending",
        invited_by: effectiveUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,user_id" }
    );
    invited.push(match.username);
  }

  return NextResponse.json({
    success: true,
    data: { invited_usernames: invited, not_found_usernames: notFound },
  });
}
