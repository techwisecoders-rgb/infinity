import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUserNetwork } from "@/lib/supabase/ensure-user-network";
import { z } from "zod";
import { saveUserPasswordHash } from "@/lib/auth/password";
import { isSmtpConfigured, verifyEmailOtp } from "@/lib/auth/otp-mailer";
import {
  INFINITY_USERNAME_PREFIX,
  isValidUsernameBody,
  normalizeInfinityUsername,
  stripUsernamePrefix,
} from "@/lib/auth/username";

const verifyOtpSchema = z.object({
  email: z.string().email("Invalid email address").transform((value) => value.trim().toLowerCase()),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
  account_type: z.enum(["personal", "creator", "business"]).default("personal"),
  mode: z.enum(["login", "register"]).default("login"),
  display_name: z.string().trim().min(2).max(80).optional(),
  username: z
    .string()
    .trim()
    .refine(isValidUsernameBody, "Username must be 3–30 characters and use only letters, numbers, or underscores.")
    .transform(normalizeInfinityUsername)
    .optional(),
  password: z.string().min(8, "Password must be at least 8 characters.").max(72).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = verifyOtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Invalid verification request." } },
        { status: 400 },
      );
    }

    const { email, otp, account_type, mode, display_name, username, password } = parsed.data;
    if (mode === "register" && (!display_name || !username)) {
      return NextResponse.json(
        { success: false, error: { code: "REGISTRATION_DETAILS_REQUIRED", message: "Your name and username are required to finish registration." } },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const adminClient = createAdminClient();

    let user: any = null;
    let session: any = null;

    if (isSmtpConfigured()) {
      const otpCheck = await verifyEmailOtp(email, otp, mode);
      if (!otpCheck.valid) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_OTP", message: otpCheck.message || "Invalid or expired 6-digit verification code." } },
          { status: 400 },
        );
      }

      if (mode === "register") {
        const { data: existingAuthId } = await adminClient.rpc("get_auth_user_id_by_email", { p_email: email });
        const userPassword = password || crypto.randomUUID();
        if (existingAuthId) {
          const { error: updateErr } = await adminClient.auth.admin.updateUserById(existingAuthId, {
            password: userPassword,
            email_confirm: true,
            user_metadata: { account_type, display_name, username },
          });
          if (updateErr) {
            return NextResponse.json(
              { success: false, error: { code: "ACCOUNT_CREATE_FAILED", message: updateErr.message } },
              { status: 500 },
            );
          }
        } else {
          const { error: createErr } = await adminClient.auth.admin.createUser({
            email,
            password: userPassword,
            email_confirm: true,
            user_metadata: { account_type, display_name, username },
          });
          if (createErr) {
            return NextResponse.json(
              { success: false, error: { code: "ACCOUNT_CREATE_FAILED", message: createErr.message } },
              { status: 500 },
            );
          }
        }
      }

      // Issue a real cookie-backed Supabase session without sending a Supabase email.
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

      const tokenHash = linkData?.properties?.hashed_token;
      if (linkError || !tokenHash) {
        console.error("Session link generation failed:", linkError?.message);
        return NextResponse.json(
          { success: false, error: { code: "SESSION_CREATE_FAILED", message: "Could not start your session. Please try again." } },
          { status: 500 },
        );
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "magiclink",
      });

      if (sessionError || !sessionData.user) {
        console.error("Session verification failed:", sessionError?.message);
        return NextResponse.json(
          { success: false, error: { code: "SESSION_CREATE_FAILED", message: "Could not sign you in after verification. Please try again." } },
          { status: 500 },
        );
      }

      user = sessionData.user;
      session = sessionData.session;
    } else {
      const { data: authData, error: authError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "email",
      });

      if (authError || !authData.user) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_OTP", message: "Invalid or expired 6-digit verification code. Please try again." } },
          { status: 400 },
        );
      }

      user = authData.user;
      session = authData.session;

      if (mode === "register" && password) {
        const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(user.id, { password });
        if (authUpdateError) {
          console.error("Auth password update error:", authUpdateError.message);
          await supabase.auth.signOut();
          return NextResponse.json(
            { success: false, error: { code: "PASSWORD_SAVE_FAILED", message: "Could not save your password. Please try again." } },
            { status: 500 },
          );
        }
      }
    }

    // On registration, persist the bcrypt password hash in user_credentials via pgcrypto.
    if (mode === "register" && password) {
      const { error: credError } = await saveUserPasswordHash(adminClient, user.id, password);
      if (credError) {
        console.error("Bcrypt credential save error:", credError);
        await supabase.auth.signOut();
        return NextResponse.json(
          { success: false, error: { code: "CREDENTIAL_SAVE_FAILED", message: "Could not save your encrypted password. Apply migration 030_user_credentials_bcrypt.sql and try again." } },
          { status: 503 },
        );
      }
    }

    const { data: existingProfile, error: profileLookupError } = await adminClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileLookupError) {
      console.error("Profile lookup error:", profileLookupError.message);
      await supabase.auth.signOut();
      return NextResponse.json(
        { success: false, error: { code: "PROFILE_LOOKUP_FAILED", message: "Could not load your account. Please try again." } },
        { status: 500 },
      );
    }

    const emailName = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "") || "user";
    const generatedUsername = `${INFINITY_USERNAME_PREFIX}${emailName.slice(0, 20)}_${user.id.slice(0, 8)}`;
    const metadataAccountType = user.user_metadata?.account_type;
    const isNewAccountWithTriggerDefault = Boolean(
      existingProfile &&
      existingProfile.account_type === "personal" &&
      account_type !== "personal" &&
      metadataAccountType === account_type,
    );

    if (existingProfile && existingProfile.account_type !== account_type && !isNewAccountWithTriggerDefault) {
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ACCOUNT_TYPE_MISMATCH",
            message: `This email is registered as ${existingProfile.account_type}. Select the matching account type to sign in.`,
          },
        },
        { status: 400 },
      );
    }

    const rawUsernameInput = username || user.user_metadata?.username || "";
    const requestedUsername = rawUsernameInput ? normalizeInfinityUsername(rawUsernameInput) : "";
    const requestedDisplayName = (display_name || user.user_metadata?.display_name || "").trim();

    if (mode === "register" && requestedUsername) {
      const rawBody = stripUsernamePrefix(requestedUsername).toLowerCase();
      const { data: usernameOwner, error: usernameLookupError } = await adminClient
        .from("profiles")
        .select("id")
        .in("username", [requestedUsername, rawBody])
        .neq("id", user.id)
        .maybeSingle();

      if (usernameLookupError) {
        console.error("Username lookup error:", usernameLookupError.message);
        await supabase.auth.signOut();
        return NextResponse.json(
          { success: false, error: { code: "USERNAME_CHECK_FAILED", message: "Could not check that username. Please try again." } },
          { status: 500 },
        );
      }

      if (usernameOwner) {
        await supabase.auth.signOut();
        return NextResponse.json(
          { success: false, error: { code: "USERNAME_TAKEN", message: "That username is already taken. Go back, choose another username and request a new code." } },
          { status: 409 },
        );
      }
    }

    if (existingProfile) {
      const profileUpdates: Record<string, string> = { updated_at: new Date().toISOString() };
      if (!existingProfile.username) profileUpdates.username = requestedUsername || generatedUsername;
      if (!existingProfile.display_name) profileUpdates.display_name = requestedDisplayName || emailName;
      if (isNewAccountWithTriggerDefault) profileUpdates.account_type = account_type;

      if (Object.keys(profileUpdates).length > 1) {
        const { error: updateError } = await adminClient
          .from("profiles")
          .update(profileUpdates)
          .eq("id", user.id);

        if (updateError) {
          console.error("Profile update error:", updateError.message);
          await supabase.auth.signOut();
          const isUsernameConflict = updateError.code === "23505";
          return NextResponse.json(
            {
              success: false,
              error: {
                code: isUsernameConflict ? "USERNAME_TAKEN" : "PROFILE_UPDATE_FAILED",
                message: isUsernameConflict
                  ? "That username is already taken. Go back, choose another username and request a new code."
                  : "Your account profile could not be saved. Please try again.",
              },
            },
            { status: isUsernameConflict ? 409 : 500 },
          );
        }
      }
    } else {
      const { error: profileError } = await adminClient.from("profiles").insert({
        id: user.id,
        username: requestedUsername || generatedUsername,
        display_name: requestedDisplayName || emailName,
        account_type,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (profileError) {
        console.error("Profile creation error:", profileError);
        await supabase.auth.signOut();
        const isUsernameConflict = profileError.code === "23505";
        return NextResponse.json(
          {
            success: false,
            error: {
              code: isUsernameConflict ? "USERNAME_TAKEN" : "PROFILE_CREATION_FAILED",
              message: isUsernameConflict
                ? "That username is already taken. Go back, choose another username and request a new code."
                : "Your account could not be created. Please try again.",
            },
          },
          { status: isUsernameConflict ? 409 : 500 },
        );
      }

      await adminClient.from("user_settings").upsert({
        user_id: user.id,
        theme: "system",
        language: "en",
        email_notifications: true,
        push_notifications: true,
        show_online_status: true,
        allow_direct_messages: "followers",
        media_autoplay: true,
        data_saver: false,
      }, { onConflict: "user_id" });

      await adminClient.from("user_privacy_settings").upsert({
        user_id: user.id,
        account_visibility: "public",
        show_profile_to: "everyone",
        show_posts_to: "everyone",
        show_followers_list: true,
        show_following_list: true,
        allow_tagging: "followers",
        allow_mentions: "followers",
        show_read_receipts: true,
        index_profile_in_search: true,
      }, { onConflict: "user_id" });
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile) {
      await ensureUserNetwork(adminClient, profile).catch(() => null);
    }

    const { data: settings } = await adminClient
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: privacy } = await adminClient
      .from("user_privacy_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      message: mode === "register" ? "Account created successfully" : "Login successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          email_confirmed_at: user.email_confirmed_at,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at,
        },
        profile,
        settings,
        privacy,
        session,
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
      { status: 500 },
    );
  }
}
