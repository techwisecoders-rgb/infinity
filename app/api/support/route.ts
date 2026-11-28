import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureNetworksSchema, isMissingSchemaError } from "@/lib/supabase/ensure-networks-schema";
import { v4 as uuidv4 } from "uuid";

function normalizeTargetKey(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().slice(0, 160);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const viewerIdParam = String(url.searchParams.get("viewer_id") ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  let { data: allRows, error } = await admin
    .from("target_supporters")
    .select("target_key, user_id");

  if (isMissingSchemaError(error) && (await ensureNetworksSchema())) {
    ({ data: allRows, error } = await admin
      .from("target_supporters")
      .select("target_key, user_id"));
  }

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  const counts: Record<string, number> = {};
  const supportedTargets: string[] = [];
  const uid = UUID_REGEX.test(viewerIdParam) ? viewerIdParam : (!authError && user ? user.id : null);

  for (const row of allRows ?? []) {
    const key = String(row.target_key || "");
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
    if (uid && row.user_id === uid) {
      supportedTargets.push(key);
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      supported_targets: supportedTargets,
      counts,
    },
  });
}

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({}));
  const requestedUserId = String(body?.user_id ?? "").trim();
  const effectiveUserId = UUID_REGEX.test(requestedUserId) ? requestedUserId : user.id;
  const targetKey = normalizeTargetKey(body?.target_key);
  if (!targetKey) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "target_key is required" } },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let { data: existing, error: exErr } = await admin
    .from("target_supporters")
    .select("id")
    .eq("target_key", targetKey)
    .eq("user_id", effectiveUserId)
    .maybeSingle();

  if (isMissingSchemaError(exErr) && (await ensureNetworksSchema())) {
    ({ data: existing, error: exErr } = await admin
      .from("target_supporters")
      .select("id")
      .eq("target_key", targetKey)
      .eq("user_id", effectiveUserId)
      .maybeSingle());
  }

  let supported = false;
  if (existing) {
    const { error: delError } = await admin
      .from("target_supporters")
      .delete()
      .eq("id", existing.id);
    if (delError) {
      return NextResponse.json(
        { success: false, error: { code: "DATABASE_ERROR", message: delError.message } },
        { status: 500 }
      );
    }
    supported = false;
  } else {
    const { error: insError } = await admin
      .from("target_supporters")
      .insert({
        id: uuidv4(),
        target_key: targetKey,
        user_id: effectiveUserId,
        user_email: user.email || null,
      });
    if (insError) {
      return NextResponse.json(
        { success: false, error: { code: "DATABASE_ERROR", message: insError.message } },
        { status: 500 }
      );
    }
    supported = true;
  }

  const { count } = await admin
    .from("target_supporters")
    .select("id", { count: "exact", head: true })
    .eq("target_key", targetKey);

  return NextResponse.json({
    success: true,
    data: {
      target_key: targetKey,
      supported,
      supporters_count: count ?? 0,
    },
  });
}
