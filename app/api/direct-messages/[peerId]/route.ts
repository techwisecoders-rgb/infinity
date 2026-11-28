import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDirectMessagesSchema, isMissingDmSchemaError } from "@/lib/supabase/ensure-direct-messages-schema";
import { v4 as uuidv4 } from "uuid";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ peerId: string }> }
) {
  const { peerId } = await context.params;
  if (!UUID_RE.test(peerId)) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_ID", message: "Invalid peer id" } },
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
  if (!effectiveViewerId) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Please log in first" } },
      { status: 401 }
    );
  }

  const admin = createAdminClient();
  const filterExpr = `and(sender_id.eq.${effectiveViewerId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${effectiveViewerId})`;

  let { data: messages, error } = await admin
    .from("direct_messages")
    .select("id, sender_id, recipient_id, content, created_at")
    .or(filterExpr)
    .order("created_at", { ascending: true });

  if (isMissingDmSchemaError(error) && (await ensureDirectMessagesSchema())) {
    ({ data: messages, error } = await admin
      .from("direct_messages")
      .select("id, sender_id, recipient_id, content, created_at")
      .or(filterExpr)
      .order("created_at", { ascending: true }));
  }

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: messages ?? [] });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ peerId: string }> }
) {
  const { peerId } = await context.params;
  if (!UUID_RE.test(peerId)) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_ID", message: "Invalid peer id" } },
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
  let { data: created, error } = await admin
    .from("direct_messages")
    .insert({
      id: uuidv4(),
      sender_id: effectiveSenderId,
      recipient_id: peerId,
      content,
    })
    .select("id, sender_id, recipient_id, content, created_at")
    .single();

  if (isMissingDmSchemaError(error) && (await ensureDirectMessagesSchema())) {
    ({ data: created, error } = await admin
      .from("direct_messages")
      .insert({
        id: uuidv4(),
        sender_id: effectiveSenderId,
        recipient_id: peerId,
        content,
      })
      .select("id, sender_id, recipient_id, content, created_at")
      .single());
  }

  if (error || !created) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error?.message || "Failed to send message" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: created }, { status: 201 });
}
