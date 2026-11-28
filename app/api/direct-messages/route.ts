import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDirectMessagesSchema, isMissingDmSchemaError } from "@/lib/supabase/ensure-direct-messages-schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const viewerIdParam = String(url.searchParams.get("viewer_id") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const effectiveViewerId = UUID_RE.test(viewerIdParam) ? viewerIdParam : (user?.id || "");
  if (!effectiveViewerId) {
    return NextResponse.json({ success: true, data: [] });
  }

  const admin = createAdminClient();
  let { data: rows, error } = await admin
    .from("direct_messages")
    .select("id, sender_id, recipient_id, content, created_at")
    .or(`sender_id.eq.${effectiveViewerId},recipient_id.eq.${effectiveViewerId}`)
    .order("created_at", { ascending: false })
    .limit(200);

  if (isMissingDmSchemaError(error) && (await ensureDirectMessagesSchema())) {
    ({ data: rows, error } = await admin
      .from("direct_messages")
      .select("id, sender_id, recipient_id, content, created_at")
      .or(`sender_id.eq.${effectiveViewerId},recipient_id.eq.${effectiveViewerId}`)
      .order("created_at", { ascending: false })
      .limit(200));
  }

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  const latestByPeer = new Map<string, { content: string; created_at: string }>();
  for (const r of rows ?? []) {
    const peerId = String(r.sender_id) === effectiveViewerId ? String(r.recipient_id) : String(r.sender_id);
    if (!peerId || latestByPeer.has(peerId)) continue;
    latestByPeer.set(peerId, { content: String(r.content || ""), created_at: String(r.created_at || "") });
  }

  const peerIds = Array.from(latestByPeer.keys());
  if (peerIds.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", peerIds);

  const profileMap = new Map<string, any>();
  for (const p of profiles ?? []) {
    profileMap.set(String(p.id), p);
  }

  const conversations = peerIds
    .map((pid) => {
      const p = profileMap.get(pid);
      if (!p) return null;
      const uname = String(p.username || "").replace(/^@+/, "");
      const last = latestByPeer.get(pid)!;
      return {
        id: pid,
        username: uname ? `@${uname}` : "",
        display_name: String(p.display_name || uname || "User"),
        avatar_url: p.avatar_url || null,
        last_message: last.content,
        last_at: last.created_at,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ success: true, data: conversations });
}
