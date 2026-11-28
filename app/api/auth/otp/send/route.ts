import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { isValidUsernameBody, normalizeInfinityUsername } from "@/lib/auth/username";
import { isSmtpConfigured, sendEmailOtp } from "@/lib/auth/otp-mailer";

const sendOtpSchema = z.object({
  email: z.string().email("Enter a valid email address.").transform((value) => value.trim().toLowerCase()),
  account_type: z.enum(["personal", "creator", "business"]).default("personal"),
  mode: z.enum(["login", "register"]).default("login"),
  display_name: z.string().trim().min(2).max(80).optional(),
  username: z
    .string()
    .trim()
    .refine(isValidUsernameBody, "Username must be 3–30 characters and use only letters, numbers, or underscores.")
    .transform(normalizeInfinityUsername)
    .optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = sendOtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Invalid registration details." } },
        { status: 400 },
      );
    }

    const { email, account_type, mode, display_name, username } = parsed.data;
    if (mode === "register" && (!display_name || !username)) {
      return NextResponse.json(
        { success: false, error: { code: "REGISTRATION_DETAILS_REQUIRED", message: "Enter your name and username before continuing." } },
        { status: 400 },
      );
    }

    if (isSmtpConfigured()) {
      const { expiresInSeconds } = await sendEmailOtp(email, mode);
      return NextResponse.json({
        success: true,
        message: `A 6-digit verification code has been sent to ${email}. Check your inbox (and spam folder).`,
        data: { email, account_type, expires_in: expiresInSeconds },
      });
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Do not silently create a new account from the sign-in screen.
        shouldCreateUser: mode === "register",
        ...(mode === "register"
          ? {
              data: {
                account_type,
                display_name,
                username,
              },
            }
          : {}),
      },
    });

    if (error) {
      console.error("Supabase OTP send error:", error.message);
      const normalizedMessage = error.message.toLowerCase();
      const isMissingLoginAccount = mode === "login" && (
        normalizedMessage.includes("user not found") ||
        normalizedMessage.includes("no user") ||
        normalizedMessage.includes("not registered")
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: isMissingLoginAccount ? "ACCOUNT_NOT_FOUND" : "OTP_SEND_FAILED",
            message: isMissingLoginAccount
              ? "No account was found for this email. Switch to Create account to register."
              : error.message || "Could not send the verification code. Please try again.",
          },
        },
        { status: isMissingLoginAccount ? 404 : 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `A 6-digit verification code has been sent to ${email}. Check your inbox (and spam folder).`,
      data: { email, account_type, expires_in: 600 },
    });
  } catch (error) {
    console.error("Send OTP error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "An unexpected error occurred. Please try again." } },
      { status: 500 },
    );
  }
}
