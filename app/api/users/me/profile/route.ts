import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidUsernameBody, normalizeInfinityUsername, stripUsernamePrefix } from "@/lib/auth/username";

export async function GET() {
  const supabase = await createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Profile not found" } },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: profile });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const body = await request.json();
  
  // Only allow updating specific fields
  const allowedFields = ["username", "display_name", "bio", "location", "website", "account_type"];
  const updates: Record<string, unknown> = {};
  
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  // Validate and normalize username with ♾️ prefix if provided
  if (updates.username) {
    const rawBody = stripUsernamePrefix(String(updates.username)).toLowerCase();
    if (!isValidUsernameBody(rawBody)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Username must be ♾️ followed by 3–30 letters, numbers, or underscores" } },
        { status: 400 }
      );
    }
    const normalizedUsername = normalizeInfinityUsername(rawBody);
    updates.username = normalizedUsername;

    // Check availability
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .in("username", [normalizedUsername, rawBody])
      .neq("id", user.id)
      .maybeSingle();
    
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "CONFLICT", message: "Username already taken" } },
        { status: 409 }
      );
    }
  }

  updates.updated_at = new Date().toISOString();

  const { data: profile, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DATABASE_ERROR", message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: profile, message: "Profile updated successfully" });
}