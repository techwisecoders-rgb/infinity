import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureNetworksSchema, isMissingSchemaError } from "@/lib/supabase/ensure-networks-schema";
import { v4 as uuidv4 } from "uuid";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Network ID is required" } },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const viewerIdParam = String(url.searchParams.get("viewer_id") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const effectiveViewerId = UUID_REGEX.test(viewerIdParam) ? viewerIdParam : user?.id || "";

  const admin = createAdminClient();
  let { data, error } = await admin
    .from("network_messages")
    .select("*")
    .eq("network_id", id)
    .order("created_at", { ascending: true });

  if (isMissingSchemaError(error) && (await ensureNetworksSchema())) {
    ({ data, error } = await admin
      .from("network_messages")
      .select("*")
      .eq("network_id", id)
      .order("created_at", { ascending: true }));
  }

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  const filtered = (data ?? []).filter((m: any) => {
    if (!Array.isArray(m.recipient_ids) || m.recipient_ids.length === 0) return true;
    if (!effectiveViewerId) return false;
    if (String(m.sender_id) === String(effectiveViewerId)) return true;
    return m.recipient_ids.map(String).includes(String(effectiveViewerId));
  });

  const senderIds = Array.from(new Set(filtered.map((m: any) => m.sender_id).filter(Boolean)));
  const senderMap = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, username, display_name")
      .in("id", senderIds);
    for (const p of profiles ?? []) {
      const raw = String(p.username || p.display_name || "").trim().replace(/^@+/, "");
      if (raw) senderMap.set(String(p.id), `@${raw}`);
    }
  }

  const enriched = filtered.map((m: any) => ({
    ...m,
    sender_username: senderMap.get(String(m.sender_id)) || "",
  }));

  return NextResponse.json({ success: true, data: enriched });
}

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
  const content = String(body?.content ?? "").trim();
  const requestedSenderId = String(body?.sender_id ?? "").trim();
  const effectiveSenderId = UUID_REGEX.test(requestedSenderId) ? requestedSenderId : user.id;

  const rawRecipients = Array.isArray(body?.recipient_ids) ? body.recipient_ids : null;
  const cleanRecipients = rawRecipients
    ? Array.from(new Set(rawRecipients.map((r: unknown) => String(r ?? "").trim()).filter((r: string) => UUID_REGEX.test(r))))
    : null;
  const recipientIds = cleanRecipients && cleanRecipients.length > 0 ? cleanRecipients : null;

  if (!id || !content) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Message content is required" } },
      { status: 400 }
    );
  }

  if (content.length > 5000) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Message is too long" } },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let { data: network, error: netErr } = await admin
    .from("networks")
    .select("id, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (isMissingSchemaError(netErr) && (await ensureNetworksSchema())) {
    ({ data: network, error: netErr } = await admin
      .from("networks")
      .select("id, owner_id")
      .eq("id", id)
      .maybeSingle());
  }

  if (!network) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Network not found" } },
      { status: 404 }
    );
  }

  const isOwner = String(network.owner_id) === String(effectiveSenderId);
  if (!isOwner) {
    const { data: supRow } = await admin
      .from("network_supporters")
      .select("id")
      .eq("network_id", id)
      .eq("user_id", effectiveSenderId)
      .maybeSingle();
    if (!supRow) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Please support this network to send messages." } },
        { status: 403 }
      );
    }
  }

  const insertRow = {
    id: uuidv4(),
    network_id: id,
    sender_id: effectiveSenderId,
    content,
    recipient_ids: recipientIds,
  };

  let { data, error } = await admin
    .from("network_messages")
    .insert(insertRow)
    .select("*")
    .single();

  if (isMissingSchemaError(error)) {
    const ensured = await ensureNetworksSchema();
    if (ensured) {
      ({ data, error } = await admin
        .from("network_messages")
        .insert(insertRow)
        .select("*")
        .single());
    } else {
      const { recipient_ids: _omit, ...fallbackMsg } = insertRow;
      ({ data, error } = await admin
        .from("network_messages")
        .insert(fallbackMsg)
        .select("*")
        .single());
    }
  }

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  let senderUsername = "";
  const { data: senderProf } = await admin
    .from("profiles")
    .select("username, display_name")
    .eq("id", effectiveSenderId)
    .maybeSingle();
  if (senderProf) {
    const raw = String(senderProf.username || senderProf.display_name || "").trim().replace(/^@+/, "");
    if (raw) senderUsername = `@${raw}`;
  }

  return NextResponse.json({ success: true, data: { ...data, sender_username: senderUsername } }, { status: 201 });
}
