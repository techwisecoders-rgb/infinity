import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { v4 as uuidv4 } from "uuid";

const BUCKET_NAME = "post-media";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "File is required" } },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "File exceeds 50MB limit" } },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const ownerId = user?.id || String(formData.get("owner_id") ?? "anon").trim() || "anon";
  let uploadedUrl: string | null = null;

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
      if (pub?.publicUrl) uploadedUrl = pub.publicUrl;
    }
  } catch {}

  if (!uploadedUrl && file.size <= 4 * 1024 * 1024) {
    const buf = Buffer.from(await file.arrayBuffer());
    uploadedUrl = `data:${file.type || "application/octet-stream"};base64,${buf.toString("base64")}`;
  }

  if (!uploadedUrl) {
    return NextResponse.json(
      { success: false, error: { code: "UPLOAD_ERROR", message: "Could not upload file" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: { url: uploadedUrl, file_name: file.name } }, { status: 201 });
}
