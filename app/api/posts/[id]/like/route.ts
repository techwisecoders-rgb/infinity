import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id: postId } = await params;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
  }

  // Check if post exists and is accessible
  const { data: post } = await supabase
    .from("posts")
    .select("id, author_id, visibility")
    .eq("id", postId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!post) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Post not found" } }, { status: 404 });
  }

  // Check visibility
  if (post.visibility === "followers") {
    const { data: follow } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", post.author_id)
      .maybeSingle();
    if (!follow && post.author_id !== user.id) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Cannot like this post" } }, { status: 403 });
    }
  } else if (post.visibility === "private" && post.author_id !== user.id) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Cannot like this post" } }, { status: 403 });
  }

  const { error } = await supabase.from("post_likes").insert({ post_id: postId, user_id: user.id });
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ success: false, error: { code: "CONFLICT", message: "Already liked" } }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Post liked" });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id: postId } = await params;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
  }

  const { error } = await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Post unliked" });
}