import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const type = searchParams.get("type") || "all"; // users, posts, hashtags, all
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const offset = parseInt(searchParams.get("offset") || "0");

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Query too short" } }, { status: 400 });
  }

  const results: any = {};

  if (type === "users" || type === "all") {
    const { data } = await supabase.rpc("search_users", {
      p_query: query.trim(),
      p_limit: type === "users" ? limit : 10,
      p_offset: offset,
      p_viewer_id: user?.id || null,
    });
    results.users = data || [];
  }

  if (type === "posts" || type === "all") {
    const { data } = await supabase.rpc("search_posts", {
      p_query: query.trim(),
      p_limit: type === "posts" ? limit : 10,
      p_offset: offset,
      p_viewer_id: user?.id || null,
    });
    results.posts = data || [];
  }

  if (type === "hashtags" || type === "all") {
    const { data } = await supabase
      .from("hashtags")
      .select("tag, post_count")
      .ilike("tag", `%${query.trim()}%`)
      .order("post_count", { ascending: false })
      .limit(type === "hashtags" ? limit : 10);
    results.hashtags = data || [];
  }

  // Log search history if authenticated
  if (user) {
    await supabase.from("search_history").insert({
      user_id: user.id,
      query: query.trim(),
      result_type: type,
      result_count: Object.values(results).flat().length,
    });
  }

  return NextResponse.json({ success: true, data: results });
}