import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawQuery = String(url.searchParams.get("q") ?? "").trim().replace(/^@+/, "");
  const viewerId = String(url.searchParams.get("viewer_id") ?? "").trim();

  const admin = createAdminClient();
  let query = admin
    .from("profiles")
    .select("id, username, display_name, avatar_url, account_type")
    .order("username", { ascending: true })
    .limit(40);

  if (rawQuery) {
    const safe = rawQuery.replace(/[%_\\]/g, "");
    if (safe) {
      query = query.or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`);
    }
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  const normalizedQ = rawQuery.toLowerCase();
  const filtered = (data ?? [])
    .filter((p: any) => p && (!viewerId || String(p.id) !== viewerId))
    .map((p: any) => {
      const uname = String(p.username || "").replace(/^@+/, "");
      return {
        id: String(p.id),
        username: uname ? `@${uname}` : "",
        raw_username: uname,
        display_name: String(p.display_name || uname || "User"),
        avatar_url: p.avatar_url || null,
        account_type: p.account_type || "personal",
      };
    })
    .filter((p) => Boolean(p.username || p.display_name))
    .sort((a, b) => {
      if (!normalizedQ) return a.raw_username.localeCompare(b.raw_username);
      const aStarts = a.raw_username.toLowerCase().startsWith(normalizedQ) ? 0 : 1;
      const bStarts = b.raw_username.toLowerCase().startsWith(normalizedQ) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.raw_username.localeCompare(b.raw_username);
    });

  return NextResponse.json({ success: true, data: filtered });
}
