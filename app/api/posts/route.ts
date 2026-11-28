import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { v4 as uuidv4 } from "uuid";
import { ensureRepostSchema, isMissingRepostSchemaError } from "@/lib/supabase/ensure-repost-schema";

function normalizeMediaUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
  }

  const { type, content, media_url, visibility = "public", location, latitude, longitude, media_ids = [], scheduled_at, reposted_post_id = null } = await request.json();
  const validTypes = ["text", "image", "video", "audio", "file", "service", "product", "vacancy", "job", "poll"];
  if (!type || !validTypes.includes(type)) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid post type" } }, { status: 400 });
  }
  if (content && content.length > 50000) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Post too long. Max 50000 characters" } }, { status: 400 });
  }
  if (media_ids.length > 10) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Too many media items. Max 10" } }, { status: 400 });
  }
  if (!["public", "followers", "private", "close_friends"].includes(visibility)) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid visibility" } }, { status: 400 });
  }

  const normalizedMediaUrl = normalizeMediaUrl(media_url);
  if (media_url && !normalizedMediaUrl) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Enter a valid http or https media URL." } }, { status: 400 });
  }

  const adminClient = createAdminClient();
  if (media_ids.length > 0) {
    const { data: media } = await adminClient.from("media").select("id, owner_id").in("id", media_ids);
    if (!media || media.length !== media_ids.length) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid media IDs" } }, { status: 400 });
    }
    if (media.some((m: any) => m.owner_id !== user.id)) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "You don't own some media" } }, { status: 403 });
    }
  }

  const postId = uuidv4();
  const now = new Date().toISOString();
  const publishedAt = scheduled_at ? null : now;

  const { data: post, error: postError } = await adminClient
    .from("posts")
    .insert({
      id: postId,
      author_id: user.id,
      type,
      content: content || null,
      media_url: normalizedMediaUrl,
      visibility,
      location: location || null,
      latitude: latitude || null,
      longitude: longitude || null,
      scheduled_at: scheduled_at || null,
      published_at: publishedAt,
    })
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, is_verified)
    `)
    .single();

  if (postError) {
    return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: postError.message } }, { status: 500 });
  }

  if (media_ids.length > 0) {
    const postMedia = media_ids.map((mediaId: string, index: number) => ({ post_id: postId, media_id: mediaId, display_order: index }));
    const { error: pmError } = await adminClient.from("post_media").insert(postMedia);
    if (pmError) {
      await adminClient.from("posts").delete().eq("id", postId);
      return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: pmError.message } }, { status: 500 });
    }
  }

  await processTags(adminClient, postId, content, user.id);

  return NextResponse.json({ success: true, data: post, message: "Post created successfully" });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
  }

  const { id, content, media_url } = await request.json();
  if (!id) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Post ID is required" } }, { status: 400 });
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString(), is_edited: true };
  if (content !== undefined) updates.content = content || null;
  if (media_url !== undefined) {
    const normalized = normalizeMediaUrl(media_url);
    if (media_url && !normalized) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Enter a valid http or https media URL." } }, { status: 400 });
    }
    updates.media_url = normalized;
  }

  const adminClient = createAdminClient();
  const { data: post, error } = await adminClient
    .from("posts")
    .update(updates)
    .eq("id", id)
    .eq("author_id", user.id)
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, is_verified)
    `)
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: { code: "DATABASE_ERROR", message: error.message } }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: post, message: "Post updated successfully" });
}

async function processTags(adminClient: any, postId: string, content: string | null, userId: string) {
  if (!content) return;
  const tags = [...new Set((content.match(/#[\w\u0080-\uFFFF]+/g) || []).map(m => m.slice(1).toLowerCase()))];
  for (const tag of tags) {
    const { data: ex } = await adminClient.from("hashtags").select("id").eq("tag", tag).maybeSingle();
    const hid = ex?.id || (await adminClient.from("hashtags").insert({ tag, post_count: 0 }).select("id").single()).data?.id;
    if (hid) {
      await adminClient.from("post_hashtags").upsert({ post_id: postId, hashtag_id: hid }, { onConflict: "post_id,hashtag_id" });
    }
  }
  const mentions = [...new Set((content.match(/(?:♾️|♾|@)[\w.]+/gu) || []).map(m => m.replace(/^(?:♾️|♾|@)+/u, "").toLowerCase()))];
  for (const un of mentions) {
    const { data: u } = await adminClient.from("profiles").select("id").in("username", [`♾️${un}`, un]).maybeSingle();
    if (u && u.id !== userId) {
      await adminClient.from("mentions").upsert({ post_id: postId, mentioned_user_id: u.id }, { onConflict: "post_id,mentioned_user_id" });
      await adminClient.from("notifications").insert({ user_id: u.id, type: "mention", title: "New mention", body: "Someone mentioned you", reference_id: postId, reference_type: "post" });
    }
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const { data, error } = await supabase.rpc("get_post_with_details", { p_post_id: id, p_viewer_id: user.id });
    if (error || !data?.length) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Post not found" } }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: data[0] });
  }
  return NextResponse.redirect(new URL("/api/posts/feed", request.url));
}