import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureProfileContactSchema,
  isMissingProfileContactSchemaError,
} from "@/lib/supabase/ensure-profile-contact-schema";

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
  let { data, error } = await admin
    .from("profiles")
    .select("id, contact_phone, contact_email, contact_location")
    .eq("id", effectiveUserId)
    .maybeSingle();

  if (isMissingProfileContactSchemaError(error) && (await ensureProfileContactSchema())) {
    ({ data, error } = await admin
      .from("profiles")
      .select("id, contact_phone, contact_email, contact_location")
      .eq("id", effectiveUserId)
      .maybeSingle());
  }

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  let contactPhone = String((data as any)?.contact_phone ?? "").trim();
  let contactEmail = String((data as any)?.contact_email ?? "").trim();
  let contactLocation = String((data as any)?.contact_location ?? "").trim();

  if (!contactPhone || !contactEmail || !contactLocation) {
    try {
      const { data: biz } = await admin
        .from("business_profiles")
        .select("phone_number, mail, location")
        .eq("user_id", effectiveUserId)
        .maybeSingle();
      if (biz) {
        if (!contactPhone && (biz as any).phone_number) contactPhone = String((biz as any).phone_number).trim();
        if (!contactEmail && (biz as any).mail) contactEmail = String((biz as any).mail).trim();
        if (!contactLocation && (biz as any).location) contactLocation = String((biz as any).location).trim();
      }
    } catch {}
  }

  if (!contactPhone || !contactLocation) {
    try {
      const { data: wp } = await admin
        .from("worker_profiles")
        .select("phone, location")
        .eq("user_id", effectiveUserId)
        .maybeSingle();
      if (wp) {
        if (!contactPhone && (wp as any).phone && String((wp as any).phone).trim() !== "+91 Phone Number") {
          contactPhone = String((wp as any).phone).trim();
        }
        if (!contactLocation && (wp as any).location && String((wp as any).location).trim() !== "Address") {
          contactLocation = String((wp as any).location).trim();
        }
      }
    } catch {}
  }

  return NextResponse.json({
    success: true,
    data: {
      id: effectiveUserId,
      contact_phone: contactPhone,
      contact_email: contactEmail,
      contact_location: contactLocation,
    },
  });
}

async function upsertProfileContact(request: Request) {
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

  const requestedUserId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const targetUserId = UUID_REGEX.test(requestedUserId) ? requestedUserId : user.id;

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.contact_phone !== undefined) {
    updatePayload.contact_phone = typeof body.contact_phone === "string" ? body.contact_phone.trim() : "";
  }
  if (body.contact_email !== undefined) {
    updatePayload.contact_email = typeof body.contact_email === "string" ? body.contact_email.trim() : "";
  }
  if (body.contact_location !== undefined) {
    updatePayload.contact_location = typeof body.contact_location === "string" ? body.contact_location.trim() : "";
  }

  const admin = createAdminClient();
  let { data, error } = await admin
    .from("profiles")
    .update(updatePayload)
    .eq("id", targetUserId)
    .select("id, contact_phone, contact_email, contact_location")
    .single();

  if (isMissingProfileContactSchemaError(error) && (await ensureProfileContactSchema())) {
    ({ data, error } = await admin
      .from("profiles")
      .update(updatePayload)
      .eq("id", targetUserId)
      .select("id, contact_phone, contact_email, contact_location")
      .single());
  }

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request) {
  return upsertProfileContact(request);
}

export async function PUT(request: Request) {
  return upsertProfileContact(request);
}
