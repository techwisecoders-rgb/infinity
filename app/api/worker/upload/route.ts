import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { v4 as uuidv4 } from "uuid";

const BUCKET_NAME = "worker-media";
const MAX_FILE_SIZE = 32 * 1024 * 1024; // 32MB (ImgBB free limit)
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB for direct video uploads
const ALLOWED_FOLDERS = new Set(["profile", "cover", "resume", "works", "banner"]);

function isValidUuid(val: unknown): val is string {
  return typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

async function uploadToImgBB(file: File, apiKey: string): Promise<{ url: string; deleteUrl?: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64Image = buffer.toString("base64");

  const form = new FormData();
  form.append("image", base64Image);
  if (file.name) {
    form.append("name", file.name.replace(/\.[^.]+$/, ""));
  }

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    body: form,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success || !json?.data) {
    throw new Error(json?.error?.message || "ImgBB upload failed");
  }

  const directUrl = json.data.display_url || json.data.url || json.data.image?.url;
  if (!directUrl) {
    throw new Error("ImgBB did not return an image URL");
  }

  return {
    url: directUrl,
    deleteUrl: json.data.delete_url || undefined,
  };
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_FORM", message: "Expected multipart/form-data" } },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "File is required" } },
      { status: 400 }
    );
  }

  const mime = file.type || "application/octet-stream";
  const isVideo = mime.startsWith("video/");
  const sizeLimit = isVideo ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;

  if (file.size > sizeLimit) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: isVideo ? "Video exceeds 100MB limit" : "File exceeds 32MB limit" } },
      { status: 400 }
    );
  }

  if (!mime.startsWith("image/") && !isVideo && mime !== "application/pdf") {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Only image, video, and PDF files are allowed" } },
      { status: 400 }
    );
  }

  // Strictly use ImgBB Free API for all image uploads
  if (mime.startsWith("image/")) {
    const imgbbKey = String(process.env.IMGBB_API_KEY ?? "").trim();
    if (!imgbbKey) {
      return NextResponse.json(
        { success: false, error: { code: "CONFIG_ERROR", message: "IMGBB_API_KEY is not configured" } },
        { status: 500 }
      );
    }
    try {
      const uploaded = await uploadToImgBB(file, imgbbKey);
      return NextResponse.json({
        success: true,
        data: {
          url: uploaded.url,
          delete_url: uploaded.deleteUrl ?? null,
          provider: "imgbb",
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "ImgBB upload failed";
      return NextResponse.json(
        { success: false, error: { code: "IMGBB_ERROR", message } },
        { status: 502 }
      );
    }
  }

  // Non-image files (e.g. PDF resumes)
  const rawFolder = String(formData.get("folder") ?? "works").trim().toLowerCase();
  const folder = ALLOWED_FOLDERS.has(rawFolder) ? rawFolder : "works";
  const rawUserId = formData.get("user_id");
  const targetUserId = isValidUuid(rawUserId) ? String(rawUserId).trim() : user.id;

  const admin = createAdminClient();
  const { error: bucketErr } = await admin.storage.getBucket(BUCKET_NAME);
  if (bucketErr) {
    const { error: createErr } = await admin.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE,
    });
    if (createErr && !String(createErr.message || "").toLowerCase().includes("already exists")) {
      return NextResponse.json(
        { success: false, error: { code: "STORAGE_ERROR", message: createErr.message } },
        { status: 500 }
      );
    }
  }

  const ext = (file.name.split(".").pop() || "pdf").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "pdf";
  const objectPath = `${targetUserId}/${folder}/${Date.now()}-${uuidv4()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from(BUCKET_NAME)
    .upload(objectPath, buffer, {
      contentType: mime,
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json(
      { success: false, error: { code: "STORAGE_ERROR", message: uploadErr.message } },
      { status: 500 }
    );
  }

  const { data: publicData } = admin.storage.from(BUCKET_NAME).getPublicUrl(objectPath);

  return NextResponse.json({
    success: true,
    data: {
      url: publicData.publicUrl,
      path: objectPath,
      bucket: BUCKET_NAME,
      provider: "supabase",
    },
  });
}
