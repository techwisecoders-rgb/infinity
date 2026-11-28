import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureTeamsSchema, isMissingTeamSchemaError } from "@/lib/supabase/ensure-teams-schema";
import { v4 as uuidv4 } from "uuid";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function isAcceptedTeamMember(
  admin: ReturnType<typeof createAdminClient>,
  teamId: string,
  userId: string
): Promise<boolean> {
  if (!userId) return false;
  const { data: team } = await admin
    .from("teams")
    .select("owner_id")
    .eq("id", teamId)
    .maybeSingle();
  if (!team) return false;
  if (String(team.owner_id) === String(userId)) return true;

  const { data: member } = await admin
    .from("team_members")
    .select("status")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(member && member.status === "accepted");
}

export async function GET(
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

  const url = new URL(request.url);
  const viewerIdParam = String(url.searchParams.get("viewer_id") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const effectiveViewerId = UUID_RE.test(viewerIdParam) ? viewerIdParam : (user?.id || "");
  const admin = createAdminClient();

  let allowed = await isAcceptedTeamMember(admin, teamId, effectiveViewerId);
  if (!allowed) {
    // Check if schema needed initialization
    const { error: probeErr } = await admin.from("teams").select("id").limit(1);
    if (isMissingTeamSchemaError(probeErr) && (await ensureTeamsSchema())) {
      allowed = await isAcceptedTeamMember(admin, teamId, effectiveViewerId);
    }
  }

  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Only joined team members can view messages" } },
      { status: 403 }
    );
  }

  const { data: messages, error } = await admin
    .from("team_messages")
    .select("id, team_id, sender_id, content, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  const senderIds = Array.from(new Set((messages ?? []).map((m: any) => m.sender_id).filter(Boolean)));
  const senderMap = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, username, display_name")
      .in("id", senderIds);
    for (const p of profiles ?? []) {
      const handle = p.username ? `@${String(p.username).replace(/^@+/, "")}` : (p.display_name || "Member");
      senderMap.set(String(p.id), handle);
    }
  }

  const enriched = (messages ?? []).map((m: any) => ({
    ...m,
    sender_username: senderMap.get(String(m.sender_id)) || "Member",
  }));

  return NextResponse.json({ success: true, data: enriched });
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

  let body: { content?: string; sender_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_JSON", message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const senderIdParam = String(body.sender_id ?? "").trim();
  const effectiveSenderId = UUID_RE.test(senderIdParam) ? senderIdParam : (user?.id || "");
  if (!effectiveSenderId) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Please log in first" } },
      { status: 401 }
    );
  }

  const content = String(body.content ?? "").trim();
  if (!content) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Message content is required" } },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const allowed = await isAcceptedTeamMember(admin, teamId, effectiveSenderId);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Join this team to send messages" } },
      { status: 403 }
    );
  }

  const { data: created, error } = await admin
    .from("team_messages")
    .insert({
      id: uuidv4(),
      team_id: teamId,
      sender_id: effectiveSenderId,
      content,
    })
    .select("id, team_id, sender_id, content, created_at")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error?.message || "Failed to send message" } },
      { status: 500 }
    );
  }

  const { data: senderProfile } = await admin
    .from("profiles")
    .select("username, display_name")
    .eq("id", effectiveSenderId)
    .maybeSingle();

  const senderUsername = senderProfile?.username
    ? `@${String(senderProfile.username).replace(/^@+/, "")}`
    : (senderProfile?.display_name || "Member");

  return NextResponse.json(
    { success: true, data: { ...created, sender_username: senderUsername } },
    { status: 201 }
  );
}
