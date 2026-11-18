import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const cursor = searchParams.get("cursor");
  const feedType = searchParams.get("feed_type") || "home";

  const { data, error } = await supabase.rpc("get_user_feed", {
    p_user_id: user.id,
    p_limit: limit,
    p_cursor: cursor,
    p_feed_type: feedType,
  });

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  const nextCursor = data.length === limit ? data[data.length - 1].created_at : null;

  return NextResponse.json({
    success: true,
    data: data || [],
    pagination: {
      next_cursor: nextCursor,
      has_more: data.length === limit,
    },
  });
}