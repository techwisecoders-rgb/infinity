"use client";

import { FormEvent, useState } from "react";
import { INFINITY_USERNAME_PREFIX, isValidUsernameBody, normalizeInfinityUsername, stripUsernamePrefix } from "@/lib/auth/username";

type AccountType = "personal" | "creator" | "business";
type FormMode = "login" | "register";

interface OTPLoginFormProps {
  onSuccess: (data: any) => void;
  accountType?: AccountType;
  mode?: FormMode;
}

interface ApiResponse {
  success?: boolean;
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
  data?: any;
}

async function readApiResponse(response: Response): Promise<ApiResponse> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return { success: false, error: { message: "The server returned an unreadable response. Please try again." } };
  }
}

export function OTPLoginForm({
  onSuccess,
  accountType = "personal",
  mode = "login",
}: OTPLoginFormProps) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"details" | "otp">("details");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isRegister = mode === "register";
  const accountLabel = accountType === "personal" ? "user" : accountType === "creator" ? "work" : "business";
  const nameLabel = accountType === "business" ? "Business name" : "Your full name";
  const namePlaceholder = accountType === "business" ? "e.g. Infinity Technologies" : "e.g. Surya Kowshik";

  function validateRegistrationDetails() {
    if (!displayName.trim() || displayName.trim().length < 2) {
      setError(accountType === "business" ? "Enter your business name." : "Enter your full name.");
      return false;
    }

    const cleanedUsernameBody = stripUsernamePrefix(username);
    if (!isValidUsernameBody(cleanedUsernameBody)) {
      setError(`Username must be ${INFINITY_USERNAME_PREFIX} followed by 3–30 letters, numbers, or underscores.`);
      return false;
    }

    return true;
  }

  async function requestOtp(endpoint: "/api/auth/otp/send" | "/api/auth/otp/resend") {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter your email address.");
      return;
    }
    if (isRegister && !validateRegistrationDetails()) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          account_type: accountType,
          mode,
          ...(isRegister
            ? {
                display_name: displayName.trim(),
                username: normalizeInfinityUsername(username),
              }
            : {}),
        }),
      });
      const result = await readApiResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Could not send the verification code. Please try again.");
      }

      setEmail(normalizedEmail);
      setStep("otp");
      setMessage(result.message || `A verification code has been sent to ${normalizedEmail}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestOtp("/api/auth/otp/send");
  }

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedOtp = otp.replace(/\D/g, "").slice(0, 6);
    if (normalizedOtp.length !== 6) {
      setError("Enter the 6-digit code sent to your email.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: normalizedOtp,
          account_type: accountType,
          mode,
          ...(isRegister
            ? {
                display_name: displayName.trim(),
                username: normalizeInfinityUsername(username),
              }
            : {}),
        }),
      });
      const result = await readApiResponse(response);

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error?.message || "The code is invalid or expired. Please try again.");
      }

      onSuccess(result.data);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Could not verify the code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-form-content">
      {step === "details" ? (
        <>
          <div className="auth-form-heading">
            <span className="auth-step-label">{isRegister ? "STEP 01 · ACCOUNT DETAILS" : "SECURE SIGN IN"}</span>
            <h3>{isRegister ? "Create your account" : "Welcome back"}</h3>
            <p>
              {isRegister
                ? `Set up your ${accountLabel} profile. We’ll verify your email in the next step.`
                : `Enter the email linked to your ${accountLabel} account to receive a secure sign-in code.`}
            </p>
          </div>

          {error && <div role="alert" className="auth-alert auth-alert-error">{error}</div>}
          {message && <div role="status" className="auth-alert auth-alert-success">{message}</div>}

          <form onSubmit={handleDetailsSubmit} className="auth-fields">
            {isRegister && (
              <>
                <div className="auth-field">
                  <label htmlFor="auth-display-name">{nameLabel}</label>
                  <input
                    id="auth-display-name"
                    type="text"
                    autoComplete={accountType === "business" ? "organization" : "name"}
                    required
                    minLength={2}
                    maxLength={80}
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder={namePlaceholder}
                  />
                </div>
                <div className="auth-field">
                  <label htmlFor="auth-username">Username</label>
                  <div className="auth-input-with-prefix">
                    <span aria-hidden="true">{INFINITY_USERNAME_PREFIX}</span>
                    <input
                      id="auth-username"
                      type="text"
                      autoComplete="username"
                      required
                      minLength={3}
                      maxLength={30}
                      value={username}
                      onChange={(event) => setUsername(stripUsernamePrefix(event.target.value).replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30))}
                      placeholder="idl link"
                    />
                  </div>
                  <span className="auth-field-hint">Saved as {INFINITY_USERNAME_PREFIX}{username || "idl link"} · 3–30 letters, numbers and underscores</span>
                </div>
              </>
            )}

            <div className="auth-field">
              <label htmlFor="auth-email">Email address</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="universalcompanyteam@gmail.com"
              />
            </div>

            <button type="submit" disabled={loading || !email.trim()} className="auth-primary-button">
              <span>{loading ? "Sending verification code…" : isRegister ? "Create account & continue" : "Send secure login code"}</span>
              <span className="auth-button-arrow" aria-hidden="true">↗</span>
            </button>
          </form>

          <div className="auth-security-note">
            <span className="auth-security-icon" aria-hidden="true">✦</span>
            <span>{isRegister ? "No password needed. We’ll send a one-time verification code to your email." : "Your account is protected with email verification."}</span>
          </div>
        </>
      ) : (
        <>
          <div className="auth-form-heading">
            <span className="auth-step-label">STEP 02 · EMAIL VERIFICATION</span>
            <h3>Check your inbox</h3>
            <p>Enter the 6-digit code we sent to <strong>{email}</strong>.</p>
          </div>

          {error && <div role="alert" className="auth-alert auth-alert-error">{error}</div>}
          {message && <div role="status" className="auth-alert auth-alert-success">{message}</div>}

          <form onSubmit={handleOtpSubmit} className="auth-fields">
            <div className="auth-field">
              <label htmlFor="auth-otp">Verification code</label>
              <input
                id="auth-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="auth-otp-input"
                autoFocus
              />
            </div>
            <button type="submit" disabled={loading || otp.length !== 6} className="auth-primary-button">
              <span>{loading ? "Verifying…" : "Verify email & continue"}</span>
              <span className="auth-button-arrow" aria-hidden="true">↗</span>
            </button>
          </form>

          <div className="auth-otp-actions">
            <button type="button" disabled={loading} onClick={() => { setStep("details"); setOtp(""); setMessage(""); setError(""); }}>
              Change details
            </button>
            <button type="button" disabled={loading} onClick={() => void requestOtp("/api/auth/otp/resend")}>
              Resend code
            </button>
          </div>
          <div className="auth-security-note">
            <span className="auth-security-icon" aria-hidden="true">✦</span>
            <span>Never share this code with anyone. It expires after a short time.</span>
          </div>
        </>
      )}
    </div>
  );
}
