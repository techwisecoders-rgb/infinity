import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureWorkerSchema, isMissingWorkerSchemaError } from "@/lib/supabase/ensure-worker-schema";

const ALLOWED_FIELDS = [
  "name",
  "phone",
  "location",
  "qualification",
  "experience",
  "profession",
  "profile_image",
  "background_image",
  "work_available",
  "skills",
  "sections",
] as const;

function isValidUuid(val: unknown): val is string {
  return typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedUserId = String(url.searchParams.get("user_id") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // If no valid UUID is provided, we require authentication
  if (!isValidUuid(requestedUserId)) {
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
  }

  // At this point, either requestedUserId is a valid UUID, or user is guaranteed non-null
  const targetUserId = isValidUuid(requestedUserId) ? requestedUserId : user!.id;
  const admin = createAdminClient();

  let { data, error } = await admin
    .from("worker_profiles")
    .select("*")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (isMissingWorkerSchemaError(error) && (await ensureWorkerSchema())) {
    ({ data, error } = await admin
      .from("worker_profiles")
      .select("*")
      .eq("user_id", targetUserId)
      .maybeSingle());
  }

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: data ?? null });
}

async function upsertWorkerProfile(request: Request) {
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

  const targetUserId = isValidUuid(body?.user_id) ? String(body.user_id).trim() : user.id;

  const payload: Record<string, unknown> = {
    user_id: targetUserId,
    updated_at: new Date().toISOString(),
  };

  for (const field of ALLOWED_FIELDS) {
    if (body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  const admin = createAdminClient();
  let { data, error } = await admin
    .from("worker_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();

  if (isMissingWorkerSchemaError(error) && (await ensureWorkerSchema())) {
    ({ data, error } = await admin
      .from("worker_profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select()
      .single());
  }

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  if (typeof payload.profile_image === "string" && payload.profile_image.trim()) {
    const imgUrl = payload.profile_image.trim();
    try {
      await admin
        .from("profiles")
        .update({ avatar_url: imgUrl, updated_at: new Date().toISOString() })
        .eq("id", targetUserId);
      await admin
        .from("networks")
        .update({ image_url: imgUrl })
        .eq("owner_id", targetUserId);
    } catch {}
  }

  if (typeof payload.phone === "string" || typeof payload.location === "string") {
    try {
      const profPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof payload.phone === "string" && payload.phone.trim() && payload.phone.trim() !== "+91 Phone Number") {
        profPatch.contact_phone = payload.phone.trim();
      }
      if (typeof payload.location === "string" && payload.location.trim() && payload.location.trim() !== "Address") {
        profPatch.contact_location = payload.location.trim();
      }
      if (Object.keys(profPatch).length > 1) {
        await admin.from("profiles").update(profPatch).eq("id", targetUserId);
      }
    } catch {}
  }

  return NextResponse.json({
    success: true,
    data,
    message: "Worker profile saved successfully",
  });
}

export async function PUT(request: Request) {
  return upsertWorkerProfile(request);
}

export async function PATCH(request: Request) {
  return upsertWorkerProfile(request);
}
