import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { v4 as uuidv4 } from "uuid";

// In production, use @aws-sdk/client-s3 for R2
// For now, we'll generate a presigned URL structure

const ALLOWED_MIME_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg"],
  file: ["application/pdf"],
};

const MAX_FILE_SIZES = {
  image: 10 * 1024 * 1024, // 10MB
  video: 100 * 1024 * 1024, // 100MB
  audio: 50 * 1024 * 1024, // 50MB
  file: 20 * 1024 * 1024, // 20MB
};

function getMediaType(mimeType: string): "image" | "video" | "audio" | "file" | null {
  for (const [type, types] of Object.entries(ALLOWED_MIME_TYPES)) {
    if (types.includes(mimeType)) return type as "image" | "video" | "audio" | "file";
  }
  return null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const body = await request.json();
  const { filename, mime_type, size_bytes } = body;

  if (!filename || !mime_type || !size_bytes) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Missing required fields" } },
      { status: 400 }
    );
  }

  const mediaType = getMediaType(mime_type);
  if (!mediaType) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "File type not allowed" } },
      { status: 400 }
    );
  }

  const maxSize = MAX_FILE_SIZES[mediaType];
  if (size_bytes > maxSize) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: `File too large. Max size: ${maxSize / (1024 * 1024)}MB` } },
      { status: 400 }
    );
  }

  // Generate unique R2 key
  const fileExt = filename.split(".").pop() || "";
  const r2Key = `uploads/${user.id}/${Date.now()}-${uuidv4()}.${fileExt}`;
  const bucketName = process.env.R2_BUCKET_NAME || "infinity-media";

  // In production, generate actual presigned URL using AWS SDK
  // For now, return the structure the frontend needs
  const uploadUrl = `${process.env.R2_ENDPOINT || "https://example.r2.cloudflarestorage.com"}/${bucketName}/${r2Key}`;

  // Create upload session record
  const adminClient = createAdminClient();
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour

  const { error: sessionError } = await adminClient
    .from("media_upload_sessions")
    .insert({
      id: sessionId,
      user_id: user.id,
      filename,
      mime_type,
      size_bytes,
      total_chunks: 1,
      status: "initiated",
      expires_at: expiresAt,
    });

  if (sessionError) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: sessionError.message } },
      { status: 500 }
    );
  }

  // Return upload details (in production, include actual presigned URL)
  return NextResponse.json({
    success: true,
    data: {
      upload_url: uploadUrl,
      upload_id: sessionId,
      r2_key: r2Key,
      r2_bucket: bucketName,
      expires_at: expiresAt,
      method: "PUT",
      headers: {
        "Content-Type": mime_type,
      },
    },
  });
}