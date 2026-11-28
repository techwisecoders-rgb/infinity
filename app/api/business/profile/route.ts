import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureBusinessContactSchema, isMissingBusinessContactSchemaError } from "@/lib/supabase/ensure-business-contact-schema";

const ALLOWED_FIELDS = [
  "banner_url",
  "business_name",
  "tagline",
  "about_business",
  "about_owner",
  "phone_number",
  "location",
  "mail",
  "working_hours_weekday",
  "working_hours_sunday",
  "listings",
  "delivery_places",
  "social_links",
  "rating_score",
  "review_count_text",
  "reviews",
  "staff_roles",
] as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUserId = String(url.searchParams.get("user_id") ?? "").trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId);

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const effectiveUserId = isUuid ? targetUserId : (user && !authError ? user.id : "");
  if (!effectiveUserId) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("business_profiles")
    .select("*")
    .eq("user_id", effectiveUserId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: data ?? null });
}

async function upsertBusinessProfile(request: Request) {
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

  const payload: Record<string, unknown> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };

  for (const field of ALLOWED_FIELDS) {
    if (body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  const admin = createAdminClient();
  let { data, error } = await admin
    .from("business_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();

  if (isMissingBusinessContactSchemaError(error) && (await ensureBusinessContactSchema())) {
    ({ data, error } = await admin
      .from("business_profiles")
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

  if (payload.phone_number !== undefined || payload.location !== undefined || payload.mail !== undefined) {
    try {
      const profPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof payload.phone_number === "string") profPatch.contact_phone = payload.phone_number.trim();
      if (typeof payload.location === "string") profPatch.contact_location = payload.location.trim();
      if (typeof payload.mail === "string") profPatch.contact_email = payload.mail.trim();
      await admin.from("profiles").update(profPatch).eq("id", user.id);
    } catch {}
  }

  return NextResponse.json({
    success: true,
    data,
    message: "Business profile saved successfully",
  });
}

export async function PUT(request: Request) {
  return upsertBusinessProfile(request);
}

export async function PATCH(request: Request) {
  return upsertBusinessProfile(request);
}
