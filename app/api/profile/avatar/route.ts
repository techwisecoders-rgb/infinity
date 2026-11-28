import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedUserId = String(url.searchParams.get("user_id") ?? "").trim();
  const isUuid = UUID_REGEX.test(requestedUserId);

  let effectiveUserId = isUuid ? requestedUserId : "";
  if (!effectiveUserId) {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (!authError && user) {
      effectiveUserId = user.id;
    }
  }

  if (!effectiveUserId) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, avatar_url, display_name, username, bio")
    .eq("id", effectiveUserId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: data ?? null });
}

async function updateAvatar(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_JSON", message: "Invalid JSON payload" } },
      { status: 400 }
    );
  }

  const avatarUrl = typeof body.avatar_url === "string" ? body.avatar_url.trim() : "";
  if (!avatarUrl) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_INPUT", message: "avatar_url is required" } },
      { status: 400 }
    );
  }

  const requestedUserId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const targetUserId = UUID_REGEX.test(requestedUserId) ? requestedUserId : user.id;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetUserId)
    .select("id, avatar_url, display_name, username, bio")
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  try {
    await admin
      .from("networks")
      .update({ image_url: avatarUrl })
      .eq("owner_id", targetUserId);
  } catch {}

  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request) {
  return updateAvatar(request);
}

export async function PUT(request: Request) {
  return updateAvatar(request);
}
