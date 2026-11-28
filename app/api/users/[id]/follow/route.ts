import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id: targetId } = await params;
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
  if (user.id === targetId) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Cannot follow yourself" } }, { status: 400 });

  // Check if target user exists
  const { data: target } = await supabase.from("profiles").select("id, account_visibility").eq("id", targetId).single();
  if (!target) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } }, { status: 404 });

  // Check if blocked
  const { data: blocked } = await supabase.from("blocked_users").select("id").or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`).or(`blocker_id.eq.${targetId},blocked_id.eq.${targetId}`).single();
  if (blocked) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Cannot follow this user" } }, { status: 403 });

  // If private account, create follow request
  if (target.account_visibility === "private") {
    const { error } = await supabase.from("follow_requests").upsert({ requester_id: user.id, target_id: targetId, status: "pending" }, { onConflict: "requester_id,target_id,status", ignoreDuplicates: true });
    if (error && error.code !== "23505") return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });
    // Notify target user
    await supabase.from("notifications").insert({ user_id: targetId, type: "follow_request", title: "New follow request", body: "Someone wants to follow you", reference_id: user.id, reference_type: "user" });
    return NextResponse.json({ success: true, data: { status: "requested" }, message: "Follow request sent" });
  }

  // Public account - direct follow
  const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: targetId });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ success: false, error: { code: "CONFLICT", message: "Already following" } }, { status: 409 });
    return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });
  }

  // Notify target user
  await supabase.from("notifications").insert({ user_id: targetId, type: "follow", title: "New follower", body: "Someone started following you", reference_id: user.id, reference_type: "user" });

  return NextResponse.json({ success: true, data: { status: "following" }, message: "Now following" });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id: targetId } = await params;
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });

  const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetId);
  if (error) return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });

  // Also delete any pending follow request
  await supabase.from("follow_requests").delete().eq("requester_id", user.id).eq("target_id", targetId);

  return NextResponse.json({ success: true, message: "Unfollowed" });
}