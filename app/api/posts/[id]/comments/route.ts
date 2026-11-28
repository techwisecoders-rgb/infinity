import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createCommentSchema = z.object({
  content: z.string().trim().min(1, "Comment cannot be empty.").max(2000),
  parent_comment_id: z.string().uuid().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { id: postId } = await params;

  const { data: comments, error } = await supabase
    .from("comments")
    .select(`
      id,
      post_id,
      author_id,
      parent_comment_id,
      content,
      like_count,
      reply_count,
      created_at,
      author:profiles!comments_author_id_fkey(id, username, display_name, avatar_url)
    `)
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: comments || [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { id: postId } = await params;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
  }

  const parsed = createCommentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Invalid comment" } },
      { status: 400 },
    );
  }

  const { data: comment, error } = await supabase
    .from("comments")
    .insert({
      post_id: postId,
      author_id: user.id,
      parent_comment_id: parsed.data.parent_comment_id || null,
      content: parsed.data.content,
    })
    .select(`
      id,
      post_id,
      author_id,
      parent_comment_id,
      content,
      like_count,
      reply_count,
      created_at,
      author:profiles!comments_author_id_fkey(id, username, display_name, avatar_url)
    `)
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: comment });
}
