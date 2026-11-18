import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const since = searchParams.get("since");

  const { data, error } = await supabase.rpc("get_trending_hashtags", {
    p_limit: limit,
    p_since: since,
  });

  if (error) return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });

  return NextResponse.json({ success: true, data: data || [] });
}