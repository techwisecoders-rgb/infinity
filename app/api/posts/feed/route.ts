import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureProfileContactSchema, isMissingProfileContactSchemaError } from "@/lib/supabase/ensure-profile-contact-schema";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10), 50);
  const feedType = searchParams.get("feed_type") || "home";
  const authorIdParam = String(searchParams.get("author_id") ?? "").trim();
  const isAuthorUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authorIdParam);

  if (feedType === "mine" && !user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
  }

  const runFeedQuery = (withContactCols: boolean) => {
    const authorCols = withContactCols
      ? "id, username, display_name, avatar_url, is_verified, account_type, contact_phone, contact_email, contact_location"
      : "id, username, display_name, avatar_url, is_verified, account_type";
    let q = admin
      .from("posts")
      .select(`
        id,
        author_id,
        type,
        content,
        media_url,
        visibility,
        like_count,
        comment_count,
        share_count,
        repost_count,
        created_at,
        author:profiles!posts_author_id_fkey(${authorCols})
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (feedType === "mine" && user) {
      q = q.eq("author_id", user.id);
    } else if (feedType === "author" && isAuthorUuid) {
      q = q.eq("author_id", authorIdParam).eq("visibility", "public");
    } else {
      q = q.eq("visibility", "public");
    }
    return q;
  };

  let { data: posts, error } = await runFeedQuery(true);
  if (error && isMissingProfileContactSchemaError(error)) {
    const ensured = await ensureProfileContactSchema();
    ({ data: posts, error } = await runFeedQuery(ensured));
    if (error && isMissingProfileContactSchemaError(error)) {
      ({ data: posts, error } = await runFeedQuery(false));
    }
  }
  if (error) {
    return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });
  }

  const postIds = (posts || []).map((p: any) => p.id);
  let likedSet = new Set<string>();
  let bookmarkedSet = new Set<string>();
  let repostedSet = new Set<string>();

  if (user && postIds.length > 0) {
    const [{ data: likes }, { data: bookmarks }, { data: reposts }] = await Promise.all([
      admin.from("post_likes").select("post_id").eq("user_id", user.id).in("post_id", postIds),
      admin.from("bookmarks").select("post_id").eq("user_id", user.id).in("post_id", postIds),
      admin.from("post_shares").select("post_id").eq("user_id", user.id).eq("share_type", "repost").in("post_id", postIds),
    ]);
    likedSet = new Set((likes || []).map((r: any) => r.post_id));
    bookmarkedSet = new Set((bookmarks || []).map((r: any) => r.post_id));
    repostedSet = new Set((reposts || []).map((r: any) => r.post_id));
  }

  const repostIds = Array.from(new Set((posts || []).map((p: any) => p.reposted_post_id).filter(Boolean)));
  const repostMap = new Map<string, any>();
  if (repostIds.length > 0) {
    const { data: origPosts } = await admin
      .from("posts")
      .select(`
        id,
        author_id,
        type,
        content,
        media_url,
        created_at,
        author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, is_verified, account_type)
      `)
      .in("id", repostIds);
    for (const op of origPosts ?? []) {
      repostMap.set(String(op.id), op);
    }
  }

  const creatorIdsMissingAvatar = Array.from(
    new Set(
      (posts || [])
        .map((p: any) => p?.author)
        .filter((a: any) => a && a.id && !a.avatar_url && String(a.account_type || "").toLowerCase() === "creator")
        .map((a: any) => String(a.id))
    )
  );
  const workerAvatarMap = new Map<string, string>();
  if (creatorIdsMissingAvatar.length > 0) {
    try {
      const { data: wpRows } = await admin
        .from("worker_profiles")
        .select("user_id, profile_image")
        .in("user_id", creatorIdsMissingAvatar);
      if (Array.isArray(wpRows)) {
        for (const wp of wpRows as Array<{ user_id?: string; profile_image?: string | null }>) {
          if (wp?.user_id && wp?.profile_image) {
            workerAvatarMap.set(String(wp.user_id), String(wp.profile_image));
          }
        }
      }
    } catch {}
  }

  const enriched = (posts || []).map((p: any) => ({
    ...p,
    ...(p.author && !p.author.avatar_url && workerAvatarMap.has(String(p.author.id))
      ? { author: { ...p.author, avatar_url: workerAvatarMap.get(String(p.author.id)) } }
      : {}),
    reposted_post: p.reposted_post_id ? (repostMap.get(String(p.reposted_post_id)) || null) : null,
    user_has_liked: likedSet.has(p.id),
    user_has_bookmarked: bookmarkedSet.has(p.id),
    user_has_reposted: repostedSet.has(p.id),
  }));

  return NextResponse.json({
    success: true,
    data: enriched,
  });
}