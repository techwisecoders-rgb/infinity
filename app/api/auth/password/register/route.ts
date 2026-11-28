import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidUsernameBody, normalizeInfinityUsername, stripUsernamePrefix } from "@/lib/auth/username";
import { isSmtpConfigured, sendEmailOtp } from "@/lib/auth/otp-mailer";

const registerSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").transform((value) => value.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters.").max(72, "Password must be 72 characters or fewer."),
  display_name: z.string().trim().min(2, "Enter your name.").max(80),
  username: z
    .string()
    .trim()
    .refine(isValidUsernameBody, "Username must be 3–30 characters and use only letters, numbers, or underscores.")
    .transform(normalizeInfinityUsername),
  account_type: z.enum(["personal", "creator", "business"]).default("personal"),
});

function apiError(message: string, status: number, code: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function POST(request: Request) {
  try {
    const parsed = registerSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Check your registration details.", 400, "VALIDATION_ERROR");
    }

    const { email, display_name, username, account_type } = parsed.data;
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return apiError("Server setup is incomplete: the Supabase service role key is missing.", 500, "AUTH_SERVER_CONFIG");
    }

    const admin = createAdminClient();
    const rawUsernameBody = stripUsernamePrefix(username).toLowerCase();

    // Check username availability before sending the registration OTP.
    const { data: usernameOwner, error: usernameCheckError } = await admin
      .from("profiles")
      .select("id")
      .in("username", [username, rawUsernameBody])
      .maybeSingle();

    if (usernameCheckError) {
      console.error("Registration username lookup failed:", usernameCheckError.message);
      return apiError("The account database is not ready. Apply the latest Supabase migrations and try again.", 503, "PROFILE_DATABASE_NOT_READY");
    }
    if (usernameOwner) {
      return apiError("That username is already taken. Choose another username.", 409, "USERNAME_TAKEN");
    }

    // Prevent overwriting an already-confirmed account during registration.
    const { data: alreadyRegistered, error: emailCheckError } = await admin.rpc("is_email_registered", { p_email: email });
    if (!emailCheckError && alreadyRegistered === true) {
      return apiError("An account with this email already exists. Sign in instead.", 409, "EMAIL_ALREADY_REGISTERED");
    }

    if (isSmtpConfigured()) {
      const { expiresInSeconds } = await sendEmailOtp(email, "register");
      return NextResponse.json({
        success: true,
        requiresOtp: true,
        message: `A 6-digit verification code has been sent to ${email}. Enter it below to complete registration.`,
        data: {
          email,
          username,
          account_type,
          expires_in: expiresInSeconds,
        },
      });
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: {
          account_type,
          display_name,
          username,
        },
      },
    });

    if (error) {
      console.error("Supabase registration OTP send failed:", error.message);
      const message = error.message.toLowerCase();
      if (message.includes("database error saving new user")) {
        return apiError(
          "Supabase could not create the account because its signup database trigger is not updated. Apply migration 029_auth_signup_trigger_fix.sql in the Supabase SQL Editor, then try again.",
          503,
          "AUTH_DATABASE_TRIGGER_ERROR",
        );
      }
      return apiError(error.message || "Could not send the 6-digit verification code.", 400, "OTP_SEND_FAILED");
    }

    return NextResponse.json({
      success: true,
      requiresOtp: true,
      message: `A 6-digit verification code has been sent to ${email}. Enter it below to complete registration.`,
      data: {
        email,
        username,
        account_type,
        expires_in: 600,
      },
    });
  } catch (error) {
    console.error("Password registration endpoint error:", error);
    return apiError(
      error instanceof Error ? error.message : "An unexpected error occurred while creating your account. Please try again.",
      500,
      "INTERNAL_ERROR",
    );
  }
}
