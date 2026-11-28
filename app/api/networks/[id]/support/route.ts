import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureNetworksSchema, isMissingSchemaError } from "@/lib/supabase/ensure-networks-schema";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Network ID is required" } },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let { data: supporters, error } = await admin
    .from("network_supporters")
    .select("user_id, user_email, created_at")
    .eq("network_id", id)
    .order("created_at", { ascending: true });

  if (isMissingSchemaError(error) && (await ensureNetworksSchema())) {
    ({ data: supporters, error } = await admin
      .from("network_supporters")
      .select("user_id, user_email, created_at")
      .eq("network_id", id)
      .order("created_at", { ascending: true }));
  }

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  const rows = supporters ?? [];
  const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
  const profileMap = new Map<string, { username?: string; display_name?: string; account_type?: string }>();

  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, username, display_name, account_type")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profileMap.set(String(p.id), p);
    }
  }

  const enriched = rows.map((r: any) => {
    const prof = profileMap.get(String(r.user_id));
    const rawName = prof?.username || prof?.display_name || r.user_email || "Supporter";
    return {
      user_id: String(r.user_id),
      username: String(rawName).startsWith("@") ? String(rawName) : `@${rawName}`,
      display_name: prof?.display_name || prof?.username || "Supporter",
      account_type: prof?.account_type || "personal",
    };
  });

  return NextResponse.json({ success: true, data: enriched });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const requestedUserId = String(body?.user_id ?? "").trim();
  const effectiveUserId = UUID_REGEX.test(requestedUserId) ? requestedUserId : user.id;
  if (!id) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Network ID is required" } },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let { data: network, error: netError } = await admin
    .from("networks")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (isMissingSchemaError(netError) && (await ensureNetworksSchema())) {
    ({ data: network, error: netError } = await admin
      .from("networks")
      .select("id")
      .eq("id", id)
      .maybeSingle());
  }

  if (netError || !network) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Network not found" } },
      { status: 404 }
    );
  }

  let { data: existing, error: exErr } = await admin
    .from("network_supporters")
    .select("id")
    .eq("network_id", id)
    .eq("user_id", effectiveUserId)
    .maybeSingle();

  if (isMissingSchemaError(exErr) && (await ensureNetworksSchema())) {
    ({ data: existing, error: exErr } = await admin
      .from("network_supporters")
      .select("id")
      .eq("network_id", id)
      .eq("user_id", effectiveUserId)
      .maybeSingle());
  }

  let supported = false;
  if (existing) {
    const { error: delError } = await admin
      .from("network_supporters")
      .delete()
      .eq("id", existing.id);
    if (delError) {
      return NextResponse.json(
        { success: false, error: { code: "DATABASE_ERROR", message: delError.message } },
        { status: 500 }
      );
    }
    supported = false;
  } else {
    const { error: insError } = await admin
      .from("network_supporters")
      .insert({
        id: uuidv4(),
        network_id: id,
        user_id: effectiveUserId,
        user_email: user.email || null,
      });
    if (insError) {
      return NextResponse.json(
        { success: false, error: { code: "DATABASE_ERROR", message: insError.message } },
        { status: 500 }
      );
    }
    supported = true;
  }

  const { count } = await admin
    .from("network_supporters")
    .select("id", { count: "exact", head: true })
    .eq("network_id", id);

  const supportersCount = count ?? 0;
  await admin
    .from("networks")
    .update({ supporters_count: supportersCount })
    .eq("id", id);

  return NextResponse.json({
    success: true,
    data: {
      network_id: id,
      supported,
      supporters_count: supportersCount,
    },
  });
}
