import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureTeamsSchema, isMissingTeamSchemaError } from "@/lib/supabase/ensure-teams-schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  let body: { action?: string; user_id?: string };
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

  const action = String(body.action ?? "").trim().toLowerCase();
  if (!["accept", "decline"].includes(action)) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "action must be accept or decline" } },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let { data: membership, error: checkErr } = await admin
    .from("team_members")
    .select("id, status")
    .eq("team_id", teamId)
    .eq("user_id", effectiveUserId)
    .maybeSingle();

  if (isMissingTeamSchemaError(checkErr) && (await ensureTeamsSchema())) {
    ({ data: membership, error: checkErr } = await admin
      .from("team_members")
      .select("id, status")
      .eq("team_id", teamId)
      .eq("user_id", effectiveUserId)
      .maybeSingle());
  }

  if (checkErr || !membership) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Team invitation not found" } },
      { status: 404 }
    );
  }

  const newStatus = action === "accept" ? "accepted" : "declined";
  const { error: updateErr } = await admin
    .from("team_members")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", membership.id);

  if (updateErr) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: updateErr.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { team_id: teamId, user_id: effectiveUserId, status: newStatus },
  });
}
