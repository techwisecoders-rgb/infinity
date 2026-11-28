import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const shareSchema = z.object({
  share_type: z.enum(["repost", "quote", "external"]).default("repost"),
  quote_content: z.string().trim().max(1000).optional(),
});

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

  const body = await request.json().catch(() => ({}));
  const parsed = shareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid share payload" } }, { status: 400 });
  }

  const { error } = await supabase.from("post_shares").insert({
    post_id: postId,
    user_id: user.id,
    share_type: parsed.data.share_type,
    quote_content: parsed.data.quote_content || null,
  });

  if (error) {
    return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Post shared" });
}
