import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { INFINITY_USERNAME_PREFIX } from "@/lib/auth/username";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";

  if (!code) {
    return NextResponse.redirect(new URL("/?error=missing_code", request.url));
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  // Exchange the code for a session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Auth callback error:", error);
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
  }

  if (data.user && data.session) {
    // Check if profile exists, if not create it
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    if (!existingProfile) {
      // Get account_type from user metadata
      const accountType = data.user.user_metadata?.account_type || "personal";
      
      const username = data.user.email?.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "") || "user";
      const uniqueUsername = `${INFINITY_USERNAME_PREFIX}${username}_${data.user.id.slice(0, 8)}`;

      // Create profile
      await adminClient.from("profiles").insert({
        id: data.user.id,
        username: uniqueUsername,
        display_name: username,
        account_type: accountType,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Create default settings
      await adminClient.from("user_settings").insert({
        user_id: data.user.id,
        theme: "system",
        language: "en",
        email_notifications: true,
        push_notifications: true,
        show_online_status: true,
        allow_direct_messages: "followers",
        media_autoplay: true,
        data_saver: false,
      });

      // Create default privacy settings
      await adminClient.from("user_privacy_settings").insert({
        user_id: data.user.id,
        account_visibility: "public",
        show_profile_to: "everyone",
        show_posts_to: "everyone",
        show_followers_list: true,
        show_following_list: true,
        allow_tagging: "followers",
        allow_mentions: "followers",
        show_read_receipts: true,
        index_profile_in_search: true,
      });
    }

    // Redirect to the next page with session
    const response = NextResponse.redirect(new URL(next, request.url));
    
    // The session cookies are automatically set by the middleware
    return response;
  }

  return NextResponse.redirect(new URL("/?error=no_session", request.url));
}