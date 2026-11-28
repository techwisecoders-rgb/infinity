import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureTeamsSchema, isMissingTeamSchemaError } from "@/lib/supabase/ensure-teams-schema";
import { v4 as uuidv4 } from "uuid";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeHandle(value: unknown): string {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
  return cleaned ? `@${cleaned}` : "";
}

function normalizeAccountType(value: unknown): string {
  const v = String(value ?? "").trim().toLowerCase();
  return ["personal", "creator", "business"].includes(v) ? v : "personal";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const viewerIdParam = String(url.searchParams.get("viewer_id") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const effectiveViewerId = UUID_RE.test(viewerIdParam)
    ? viewerIdParam
    : user?.id || "";

  if (!effectiveViewerId) {
    return NextResponse.json({ success: true, data: [] });
  }

  const admin = createAdminClient();

  let { data: memberRows, error: memberErr } = await admin
    .from("team_members")
    .select("team_id, user_id, role, status, invited_by")
    .eq("user_id", effectiveViewerId);

  if (isMissingTeamSchemaError(memberErr) && (await ensureTeamsSchema())) {
    ({ data: memberRows, error: memberErr } = await admin
      .from("team_members")
      .select("team_id, user_id, role, status, invited_by")
      .eq("user_id", effectiveViewerId));
  }

  if (memberErr) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: memberErr.message } },
      { status: 500 }
    );
  }

  const { data: ownedTeams, error: ownedErr } = await admin
    .from("teams")
    .select("*")
    .eq("owner_id", effectiveViewerId)
    .order("created_at", { ascending: false });

  if (ownedErr) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: ownedErr.message } },
      { status: 500 }
    );
  }

  const membershipByTeamId = new Map<string, { role: string; status: string }>();
  const involvedTeamIds = new Set<string>();

  for (const row of memberRows ?? []) {
    if (row.status === "declined") continue;
    involvedTeamIds.add(String(row.team_id));
    membershipByTeamId.set(String(row.team_id), {
      role: String(row.role || "member"),
      status: String(row.status || "pending"),
    });
  }

  for (const t of ownedTeams ?? []) {
    involvedTeamIds.add(String(t.id));
    membershipByTeamId.set(String(t.id), { role: "owner", status: "accepted" });
  }

  if (involvedTeamIds.size === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  const idsArray = Array.from(involvedTeamIds);
  const { data: teams, error: teamsErr } = await admin
    .from("teams")
    .select("*")
    .in("id", idsArray)
    .order("created_at", { ascending: false });

  if (teamsErr) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: teamsErr.message } },
      { status: 500 }
    );
  }

  const { data: allTeamMembers } = await admin
    .from("team_members")
    .select("team_id, user_id, username, role, status")
    .in("team_id", idsArray);

  const memberCounts = new Map<string, { accepted: number; pending: number; list: any[] }>();
  for (const m of allTeamMembers ?? []) {
    const tid = String(m.team_id);
    if (!memberCounts.has(tid)) {
      memberCounts.set(tid, { accepted: 0, pending: 0, list: [] });
    }
    const bucket = memberCounts.get(tid)!;
    if (m.status === "accepted") {
      bucket.accepted += 1;
      bucket.list.push({ user_id: m.user_id, username: m.username, role: m.role, status: m.status });
    } else if (m.status === "pending") {
      bucket.pending += 1;
      bucket.list.push({ user_id: m.user_id, username: m.username, role: m.role, status: m.status });
    }
  }

  const ownerIds = Array.from(new Set((teams ?? []).map((t: any) => t.owner_id).filter(Boolean)));
  const ownerHandleMap = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: owners } = await admin
      .from("profiles")
      .select("id, username, display_name")
      .in("id", ownerIds);
    for (const o of owners ?? []) {
      ownerHandleMap.set(String(o.id), o.username ? `@${String(o.username).replace(/^@+/, "")}` : (o.display_name || ""));
    }
  }

  const enriched = (teams ?? []).map((t: any) => {
    const myInfo = membershipByTeamId.get(String(t.id)) || { role: "member", status: "pending" };
    const isOwner = String(t.owner_id) === String(effectiveViewerId);
    const myStatus = isOwner ? "accepted" : myInfo.status;
    const stats = memberCounts.get(String(t.id)) || { accepted: 1, pending: 0, list: [] };

    return {
      ...t,
      owner_username: ownerHandleMap.get(String(t.owner_id)) || "",
      is_owner: isOwner,
      membership_status: myStatus,
      members_count: Math.max(1, stats.accepted),
      pending_count: stats.pending,
      members: myStatus === "accepted" ? stats.list : [],
    };
  });

  return NextResponse.json({ success: true, data: enriched });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: {
    name?: string;
    username?: string;
    description?: string;
    owner_id?: string;
    account_type?: string;
    invite_usernames?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_JSON", message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const ownerIdParam = String(body.owner_id ?? "").trim();
  const effectiveOwnerId = UUID_RE.test(ownerIdParam) ? ownerIdParam : (user?.id || "");
  if (!effectiveOwnerId) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Please log in to build a team" } },
      { status: 401 }
    );
  }

  const name = String(body.name ?? "").trim();
  const teamId = uuidv4();
  const rawProvidedUsername = normalizeHandle(body.username);
  const username = rawProvidedUsername || `@team_${teamId.replace(/-/g, "").slice(0, 12)}`;
  const description = String(body.description ?? "").trim();
  const accountType = normalizeAccountType(body.account_type);

  if (!name) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Team name is required" } },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  let { data: existing, error: lookupErr } = await admin
    .from("teams")
    .select("id")
    .ilike("username", username)
    .maybeSingle();

  if (isMissingTeamSchemaError(lookupErr) && (await ensureTeamsSchema())) {
    ({ data: existing, error: lookupErr } = await admin
      .from("teams")
      .select("id")
      .ilike("username", username)
      .maybeSingle());
  }

  if (lookupErr) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: lookupErr.message } },
      { status: 500 }
    );
  }

  if (existing) {
    return NextResponse.json(
      { success: false, error: { code: "CONFLICT", message: "This team username is already taken" } },
      { status: 409 }
    );
  }

  const { data: created, error: insertErr } = await admin
    .from("teams")
    .insert({
      id: teamId,
      owner_id: effectiveOwnerId,
      account_type: accountType,
      name,
      username,
      description,
    })
    .select("*")
    .single();

  if (insertErr || !created) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: insertErr?.message || "Failed to create team" } },
      { status: 500 }
    );
  }

  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("id, username")
    .eq("id", effectiveOwnerId)
    .maybeSingle();

  await admin.from("team_members").upsert(
    {
      team_id: teamId,
      user_id: effectiveOwnerId,
      username: ownerProfile?.username ? normalizeHandle(ownerProfile.username) : null,
      role: "owner",
      status: "accepted",
      invited_by: effectiveOwnerId,
    },
    { onConflict: "team_id,user_id" }
  );

  const rawInvites = Array.isArray(body.invite_usernames) ? body.invite_usernames : [];
  const cleanedInvites = Array.from(
    new Set(
      rawInvites
        .map((u) => normalizeHandle(u))
        .filter((u) => Boolean(u))
    )
  );

  const invitedUsernames: string[] = [];
  const notFoundUsernames: string[] = [];

  if (cleanedInvites.length > 0) {
    const { data: allProfiles } = await admin
      .from("profiles")
      .select("id, username");

    const profileByHandle = new Map<string, { id: string; username: string }>();
    for (const p of allProfiles ?? []) {
      const h = normalizeHandle(p.username);
      if (h) profileByHandle.set(h, { id: String(p.id), username: h });
    }

    for (const handle of cleanedInvites) {
      const match = profileByHandle.get(handle);
      if (!match) {
        notFoundUsernames.push(handle);
        continue;
      }
      if (match.id === effectiveOwnerId) continue;

      await admin.from("team_members").upsert(
        {
          team_id: teamId,
          user_id: match.id,
          username: match.username,
          role: "member",
          status: "pending",
          invited_by: effectiveOwnerId,
        },
        { onConflict: "team_id,user_id" }
      );
      invitedUsernames.push(match.username);
    }
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        ...created,
        is_owner: true,
        membership_status: "accepted",
        members_count: 1,
        pending_count: invitedUsernames.length,
        invited_usernames: invitedUsernames,
        not_found_usernames: notFoundUsernames,
      },
    },
    { status: 201 }
  );
}
