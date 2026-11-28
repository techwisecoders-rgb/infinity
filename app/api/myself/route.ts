import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureMyselfSchema, isMissingMyselfSchemaError } from "@/lib/supabase/ensure-myself-schema";
import { v4 as uuidv4 } from "uuid";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET_NAME = "myself-media";

function normalizeAccountType(value: unknown): string {
  const v = String(value ?? "").trim().toLowerCase();
  return ["personal", "creator", "business"].includes(v) ? v : "personal";
}

function detectItemType(mimeType: string, fileName: string): "image" | "video" | "audio" | "file" {
  const m = String(mimeType || "").toLowerCase();
  const n = String(fileName || "").toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n)) return "image";
  if (m.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi)$/.test(n)) return "video";
  if (m.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/.test(n)) return "audio";
  return "file";
}

async function uploadToImgBB(file: File, apiKey: string): Promise<string | null> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const form = new FormData();
    form.append("image", buffer.toString("base64"));
    if (file.name) form.append("name", file.name.replace(/\.[^.]+$/, ""));
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.success && json?.data) {
      return json.data.display_url || json.data.url || json.data.image?.url || null;
    }
  } catch {}
  return null;
}

async function uploadToSupabaseStorage(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
  file: File
): Promise<string | null> {
  try {
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET_NAME)) {
      await admin.storage.createBucket(BUCKET_NAME, { public: true }).catch(() => {});
    }
    const ext = (file.name.split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "");
    const path = `${ownerId}/${Date.now()}-${uuidv4()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage.from(BUCKET_NAME).upload(path, buf, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (!error) {
      const { data: pub } = admin.storage.from(BUCKET_NAME).getPublicUrl(path);
      if (pub?.publicUrl) return pub.publicUrl;
    }
  } catch {}
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const viewerIdParam = String(url.searchParams.get("viewer_id") ?? "").trim();
  const accountType = normalizeAccountType(url.searchParams.get("account_type"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const effectiveOwnerId = UUID_RE.test(viewerIdParam) ? viewerIdParam : (user?.id || "");
  if (!effectiveOwnerId) {
    return NextResponse.json({ success: true, data: [] });
  }

  const admin = createAdminClient();
  let { data, error } = await admin
    .from("myself_items")
    .select("*")
    .eq("owner_id", effectiveOwnerId)
    .eq("account_type", accountType)
    .order("created_at", { ascending: true });

  if (isMissingMyselfSchemaError(error) && (await ensureMyselfSchema())) {
    ({ data, error } = await admin
      .from("myself_items")
      .select("*")
      .eq("owner_id", effectiveOwnerId)
      .eq("account_type", accountType)
      .order("created_at", { ascending: true }));
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
  } = await supabase.auth.getUser();

  const contentType = request.headers.get("content-type") || "";
  let ownerIdParam = "";
  let accountType = "personal";
  let content = "";
  let itemType: "text" | "image" | "video" | "audio" | "file" = "text";
  let mediaUrl: string | null = null;
  let fileName: string | null = null;
  let mimeType: string | null = null;
  let uploadedFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    ownerIdParam = String(formData.get("owner_id") ?? "").trim();
    accountType = normalizeAccountType(formData.get("account_type"));
    content = String(formData.get("content") ?? "").trim();
    const f = formData.get("file");
    if (f instanceof File && f.size > 0) {
      uploadedFile = f;
      fileName = f.name || "file";
      mimeType = f.type || "application/octet-stream";
      itemType = detectItemType(mimeType, fileName);
    }
  } else {
    const body = await request.json().catch(() => ({}));
    ownerIdParam = String(body.owner_id ?? "").trim();
    accountType = normalizeAccountType(body.account_type);
    content = String(body.content ?? "").trim();
  }

  const effectiveOwnerId = UUID_RE.test(ownerIdParam) ? ownerIdParam : (user?.id || "");
  if (!effectiveOwnerId) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Please log in first" } },
      { status: 401 }
    );
  }

  const admin = createAdminClient();

  if (uploadedFile) {
    if (itemType === "image" && process.env.IMGBB_API_KEY) {
      mediaUrl = await uploadToImgBB(uploadedFile, process.env.IMGBB_API_KEY);
    }
    if (!mediaUrl) {
      mediaUrl = await uploadToSupabaseStorage(admin, effectiveOwnerId, uploadedFile);
    }
    if (!mediaUrl && uploadedFile.size <= 4 * 1024 * 1024) {
      const buf = Buffer.from(await uploadedFile.arrayBuffer());
      mediaUrl = `data:${mimeType || "application/octet-stream"};base64,${buf.toString("base64")}`;
    }
    if (!mediaUrl) {
      return NextResponse.json(
        { success: false, error: { code: "UPLOAD_ERROR", message: "Could not upload file" } },
        { status: 500 }
      );
    }
  } else if (!content) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Provide text or a file" } },
      { status: 400 }
    );
  }

  let { data: created, error } = await admin
    .from("myself_items")
    .insert({
      id: uuidv4(),
      owner_id: effectiveOwnerId,
      account_type: accountType,
      item_type: itemType,
      content,
      media_url: mediaUrl,
      file_name: fileName,
      mime_type: mimeType,
    })
    .select("*")
    .single();

  if (isMissingMyselfSchemaError(error) && (await ensureMyselfSchema())) {
    ({ data: created, error } = await admin
      .from("myself_items")
      .insert({
        id: uuidv4(),
        owner_id: effectiveOwnerId,
        account_type: accountType,
        item_type: itemType,
        content,
        media_url: mediaUrl,
        file_name: fileName,
        mime_type: mimeType,
      })
      .select("*")
      .single());
  }

  if (error || !created) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error?.message || "Failed to save" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: created }, { status: 201 });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") ?? "").trim();
  const viewerIdParam = String(url.searchParams.get("viewer_id") ?? "").trim();

  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_ID", message: "Invalid item id" } },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const effectiveOwnerId = UUID_RE.test(viewerIdParam) ? viewerIdParam : (user?.id || "");
  if (!effectiveOwnerId) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("myself_items")
    .delete()
    .eq("id", id)
    .eq("owner_id", effectiveOwnerId);

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
