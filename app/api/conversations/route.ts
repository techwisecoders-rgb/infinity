import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: Request) {
  const supabase = await createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const cursor = searchParams.get("cursor");

  const { data, error } = await supabase.rpc("get_conversations_with_details", {
    p_user_id: user.id,
    p_limit: limit,
    p_cursor: cursor,
  });

  if (error) return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });

  const nextCursor = data && data.length === limit ? data[data.length - 1].last_message_at : null;

  return NextResponse.json({ success: true, data: data || [], pagination: { next_cursor: nextCursor, has_more: data?.length === limit } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });

  const { participant_ids, type = "direct", name } = await request.json();
  
  if (!participant_ids || !Array.isArray(participant_ids) || participant_ids.length === 0) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "At least one participant required" } }, { status: 400 });
  }

  // For direct messages, check if conversation already exists
  if (type === "direct" && participant_ids.length === 1) {
    const otherId = participant_ids[0];
    const { data: memberConvs } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", otherId);
    
    const convIds = memberConvs?.map(m => m.conversation_id) || [];
    
    if (convIds.length > 0) {
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("type", "direct")
        .eq("created_by", user.id)
        .in("id", convIds)
        .single();
      
      if (existing) {
        return NextResponse.json({ success: true, data: { id: existing.id }, message: "Conversation already exists" });
      }
    }
  }

  const adminClient = createAdminClient();
  const conversationId = uuidv4();

  const { data: conv, error: convError } = await adminClient
    .from("conversations")
    .insert({
      id: conversationId,
      type,
      name: type === "group" ? name : null,
      created_by: user.id,
    })
    .select()
    .single();

  if (convError) return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: convError.message } }, { status: 500 });

  // Add creator as owner
  await adminClient.from("conversation_members").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "owner",
  });

  // Add participants
  const members = participant_ids.map((id: string) => ({
    conversation_id: conversationId,
    user_id: id,
    role: "member",
  }));

  await adminClient.from("conversation_members").insert(members);

  // Notify participants
  for (const id of participant_ids) {
    if (id !== user.id) {
      await adminClient.from("notifications").insert({
        user_id: id,
        type: "message",
        title: "New conversation",
        body: `${user.user_metadata?.display_name || "Someone"} started a conversation with you`,
        reference_id: conversationId,
        reference_type: "conversation",
      });
    }
  }

  return NextResponse.json({ success: true, data: conv, message: "Conversation created" });
}