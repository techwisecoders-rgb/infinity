import { NextResponse } from "next/server";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveUserPasswordHash, verifyUserPasswordHash } from "@/lib/auth/password";
import { isSmtpConfigured, sendEmailOtp } from "@/lib/auth/otp-mailer";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Enter your password."),
  account_type: z.enum(["personal", "creator", "business"]).default("personal"),
});

export async function POST(request: Request) {
  try {
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Enter your email and password." } },
        { status: 400 },
      );
    }

    const { email, password, account_type } = parsed.data;
    const admin = createAdminClient();

    // Resolve user ID without creating a cookie-backed session before OTP verification.
    const { data: userId, error: userLookupError } = await admin.rpc("get_auth_user_id_by_email", { p_email: email });
    if (userLookupError) {
      console.error("Login user lookup failed:", userLookupError.message);
      return NextResponse.json(
        { success: false, error: { code: "AUTH_DATABASE_NOT_READY", message: "The account database is not ready. Apply migration 030_user_credentials_bcrypt.sql and try again." } },
        { status: 503 },
      );
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CREDENTIALS", message: "The email or password is incorrect. Check your details and try again." } },
        { status: 401 },
      );
    }

    // Check if user_credentials has a bcrypt hash for this user.
    const { data: credential, error: credentialError } = await admin
      .from("user_credentials")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (credentialError) {
      console.error("Credential lookup error:", credentialError.message);
      return NextResponse.json(
        { success: false, error: { code: "CREDENTIAL_LOOKUP_FAILED", message: "Could not verify your credentials. Please try again." } },
        { status: 503 },
      );
    }

    if (credential?.user_id) {
      const { valid: passwordValid, error: verifyError } = await verifyUserPasswordHash(admin, userId, password);
      if (verifyError) {
        return NextResponse.json(
          { success: false, error: { code: "CREDENTIAL_VERIFY_FAILED", message: "Could not verify your password. Please try again." } },
          { status: 503 },
        );
      }
      if (!passwordValid) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_CREDENTIALS", message: "The email or password is incorrect. Check your details and try again." } },
          { status: 401 },
        );
      }
    } else {
      const statelessSupabase = createStatelessClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { data: authCheck, error: authCheckError } = await statelessSupabase.auth.signInWithPassword({ email, password });
      if (authCheckError || !authCheck.user) {
        const rawMessage = authCheckError?.message?.toLowerCase() || "";
        const message = rawMessage.includes("email not confirmed")
          ? "Please verify your email address with the 6-digit code before signing in."
          : "The email or password is incorrect. Check your details and try again.";
        return NextResponse.json({ success: false, error: { code: "INVALID_CREDENTIALS", message } }, { status: 401 });
      }

      await saveUserPasswordHash(admin, userId, password);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("account_type")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("Login profile lookup failed:", profileError?.message);
      return NextResponse.json(
        { success: false, error: { code: "PROFILE_NOT_FOUND", message: "Your account profile could not be loaded. Apply the latest database migrations or contact support." } },
        { status: 503 },
      );
    }

    if (profile.account_type !== account_type) {
      const label = profile.account_type === "personal" ? "User" : profile.account_type === "creator" ? "Work" : "Business";
      return NextResponse.json(
        { success: false, error: { code: "ACCOUNT_TYPE_MISMATCH", message: `This email belongs to a ${label} account. Select ${label} to sign in.` } },
        { status: 403 },
      );
    }

    if (isSmtpConfigured()) {
      const { expiresInSeconds } = await sendEmailOtp(email, "login");
      return NextResponse.json({
        success: true,
        requiresOtp: true,
        message: `A 6-digit verification code has been sent to ${email}. Enter it below to sign in.`,
        data: { email, account_type, expires_in: expiresInSeconds },
      });
    }

    const supabase = await createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (otpError) {
      console.error("Login OTP send failed:", otpError.message);
      return NextResponse.json(
        { success: false, error: { code: "OTP_SEND_FAILED", message: otpError.message || "Could not send the 6-digit login code. Please try again." } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      requiresOtp: true,
      message: `A 6-digit verification code has been sent to ${email}. Enter it below to sign in.`,
      data: { email, account_type, expires_in: 600 },
    });
  } catch (error) {
    console.error("Password login endpoint error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "An unexpected error occurred while signing in. Please try again." } },
      { status: 500 },
    );
  }
}
