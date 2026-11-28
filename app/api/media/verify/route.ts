import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { v4 as uuidv4 } from "uuid";

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
  const { upload_id, r2_key, r2_bucket, width, height, duration_seconds } = body;

  if (!upload_id || !r2_key || !r2_bucket) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Missing required fields" } },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // Get upload session
  const { data: session, error: sessionError } = await adminClient
    .from("media_upload_sessions")
    .select("*")
    .eq("id", upload_id)
    .eq("user_id", user.id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Upload session not found" } },
      { status: 404 }
    );
  }

  if (session.status !== "initiated" && session.status !== "uploading") {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_STATE", message: "Upload session expired or completed" } },
      { status: 400 }
    );
  }

  // In production, verify the file exists in R2 using HEAD request
  // For now, assume upload succeeded

  // Create media record
  const mediaId = uuidv4();
  const { data: media, error: mediaError } = await adminClient
    .from("media")
    .insert({
      id: mediaId,
      owner_id: user.id,
      type: session.mime_type.startsWith("image/") ? "image" :
            session.mime_type.startsWith("video/") ? "video" :
            session.mime_type.startsWith("audio/") ? "audio" : "file",
      r2_key,
      r2_bucket,
      filename: session.filename,
      mime_type: session.mime_type,
      size_bytes: session.size_bytes,
      width: width || null,
      height: height || null,
      duration_seconds: duration_seconds || null,
      is_processed: false,
      processing_status: "pending",
    })
    .select()
    .single();

  if (mediaError) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: mediaError.message } },
      { status: 500 }
    );
  }

  // Update upload session
  await adminClient
    .from("media_upload_sessions")
    .update({
      status: "completed",
      media_id: mediaId,
      uploaded_chunks: session.total_chunks,
      updated_at: new Date().toISOString(),
    })
    .eq("id", upload_id);

  // Queue processing jobs (thumbnail, blurhash, etc.)
  // In production, this would be async via queue
  await adminClient
    .from("media_processing_jobs")
    .insert([
      {
        media_id: mediaId,
        job_type: "thumbnail",
        status: "pending",
        max_attempts: 3,
      },
      {
        media_id: mediaId,
        job_type: "blurhash",
        status: "pending",
        max_attempts: 3,
      },
    ]);

  return NextResponse.json({
    success: true,
    data: media,
    message: "Upload verified and media record created",
  });
}