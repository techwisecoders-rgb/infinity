import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureBusinessCatalogSchema,
  isMissingBusinessCatalogError,
} from "@/lib/supabase/ensure-business-catalog-schema";
import { v4 as uuidv4 } from "uuid";

const ALLOWED_TYPES = new Set(["product", "service", "vacancy"]);

function isValidUuid(val: unknown): val is string {
  return typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fetchAll = url.searchParams.get("all") === "true";
  const requestedUserId = String(url.searchParams.get("user_id") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const admin = createAdminClient();

  const runQuery = async () => {
    let q = admin
      .from("business_catalog_items")
      .select("*")
      .order("created_at", { ascending: true });

    if (!fetchAll) {
      const targetId = isValidUuid(requestedUserId) ? requestedUserId : user!.id;
      q = q.eq("user_id", targetId);
    }
    return q;
  };

  // If no valid UUID is provided and not fetching all, we require authentication
  if (!fetchAll && !isValidUuid(requestedUserId)) {
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
  }

  let { data, error } = await runQuery();
  if (isMissingBusinessCatalogError(error) && (await ensureBusinessCatalogSchema())) {
    ({ data, error } = await runQuery());
  }

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: data ?? [] });
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
  const itemType = String(body?.item_type ?? "").trim().toLowerCase();
  const title = String(body?.title ?? "").trim();
  const subtitle = String(body?.subtitle ?? "").trim();
  const description = String(body?.description ?? "").trim();
  const imageUrl = body?.image_url ? String(body.image_url).trim() : null;
  const targetUserId = isValidUuid(body?.user_id) ? String(body.user_id).trim() : user.id;

  if (!ALLOWED_TYPES.has(itemType) || !title) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Valid item_type and title are required." } },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const insertPayload = {
    id: uuidv4(),
    user_id: targetUserId,
    item_type: itemType,
    title,
    subtitle,
    description,
    image_url: imageUrl,
  };

  let { data, error } = await admin
    .from("business_catalog_items")
    .insert(insertPayload)
    .select("*")
    .single();

  if (isMissingBusinessCatalogError(error) && (await ensureBusinessCatalogSchema())) {
    ({ data, error } = await admin
      .from("business_catalog_items")
      .insert(insertPayload)
      .select("*")
      .single());
  }

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data }, { status: 201 });
}

export async function PUT(request: Request) {
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
  const id = String(body?.id ?? "").trim();
  if (!isValidUuid(id)) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Valid item id is required." } },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body?.item_type !== undefined && ALLOWED_TYPES.has(String(body.item_type).toLowerCase())) {
    updates.item_type = String(body.item_type).toLowerCase();
  }
  if (body?.title !== undefined) updates.title = String(body.title).trim();
  if (body?.subtitle !== undefined) updates.subtitle = String(body.subtitle).trim();
  if (body?.description !== undefined) updates.description = String(body.description).trim();
  if (body?.image_url !== undefined) updates.image_url = body.image_url ? String(body.image_url).trim() : null;

  const admin = createAdminClient();
  let { data, error } = await admin
    .from("business_catalog_items")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (isMissingBusinessCatalogError(error) && (await ensureBusinessCatalogSchema())) {
    ({ data, error } = await admin
      .from("business_catalog_items")
      .update(updates)
      .eq("id", id)
      .select("*")
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
