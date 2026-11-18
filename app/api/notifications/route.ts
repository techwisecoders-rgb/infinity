import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const cursor = searchParams.get("cursor");
  const unreadOnly = searchParams.get("unread_only") === "true";

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq("is_read", false);
  if (cursor) query = query.lt("created_at", cursor);

  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });

  const nextCursor = data && data.length === limit ? data[data.length - 1].created_at : null;

  return NextResponse.json({ success: true, data: data || [], pagination: { next_cursor: nextCursor, has_more: data?.length === limit } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });

  const { notification_ids, mark_all_read } = await request.json();

  if (mark_all_read) {
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    if (error) return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });
    return NextResponse.json({ success: true, message: "All notifications marked as read" });
  }

  if (notification_ids && Array.isArray(notification_ids) && notification_ids.length > 0) {
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).in("id", notification_ids);
    if (error) return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });
    return NextResponse.json({ success: true, message: "Notifications marked as read" });
  }

  return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "notification_ids or mark_all_read required" } }, { status: 400 });
}