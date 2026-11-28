"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { INFINITY_USERNAME_PREFIX, isValidUsernameBody, normalizeInfinityUsername, stripUsernamePrefix } from "@/lib/auth/username";

type AccountType = "personal" | "creator" | "business";
type FormMode = "login" | "register";

interface AuthFormProps {
  onSuccess: (data: any) => void;
  accountType?: AccountType;
  mode?: FormMode;
}

interface ApiResponse {
  success?: boolean;
  requiresOtp?: boolean;
  message?: string;
  error?: { code?: string; message?: string };
  data?: any;
}

async function readApiResponse(response: Response): Promise<ApiResponse> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return { success: false, error: { message: "The server returned an unreadable response. Please try again." } };
  }
}

export function AuthForm({ onSuccess, accountType = "personal", mode = "login" }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const normalizedEmail = email.trim().toLowerCase();
    const cleanedUsernameBody = stripUsernamePrefix(username).toLowerCase();
    const formattedUsername = normalizeInfinityUsername(cleanedUsernameBody);

    if (isRegister) {
      if (displayName.trim().length < 2) {
        setError(accountType === "business" ? "Enter your business name." : "Enter your full name.");
        return;
      }
      if (!isValidUsernameBody(cleanedUsernameBody)) {
        setError(`Username must be ${INFINITY_USERNAME_PREFIX} followed by 3–30 letters, numbers, or underscores.`);
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("The passwords do not match.");
        return;
      }
    }

    setLoading(true);
    try {
      const response = await fetch(isRegister ? "/api/auth/password/register" : "/api/auth/password/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          account_type: accountType,
          ...(isRegister ? { display_name: displayName.trim(), username: formattedUsername } : {}),
        }),
      });
      const result = await readApiResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || (isRegister ? "Could not create your account." : "Could not sign in."));
      }

      setEmail(normalizedEmail);
      setOtp("");
      setStep("otp");
      setMessage(result.message || `A 6-digit verification code has been sent to ${normalizedEmail}.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const normalizedOtp = otp.replace(/\D/g, "").slice(0, 6);
    if (normalizedOtp.length !== 6) {
      setError("Enter the 6-digit code sent to your email.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const formattedUsername = normalizeInfinityUsername(username);

    setLoading(true);
    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          otp: normalizedOtp,
          account_type: accountType,
          mode,
          ...(isRegister
            ? {
                display_name: displayName.trim(),
                username: formattedUsername,
                password,
              }
            : {}),
        }),
      });
      const result = await readApiResponse(response);

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error?.message || "The 6-digit code is invalid or expired. Please try again.");
      }

      onSuccess(result.data);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Could not verify the 6-digit code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const formattedUsername = normalizeInfinityUsername(username);
      const response = await fetch("/api/auth/otp/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          account_type: accountType,
          mode,
          ...(isRegister ? { display_name: displayName.trim(), username: formattedUsername } : {}),
        }),
      });
      const result = await readApiResponse(response);
      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Could not resend the 6-digit code. Please try again.");
      }
      setMessage(result.message || `A new 6-digit verification code has been sent to ${normalizedEmail}.`);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "Could not resend the code.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "otp") {
    return (
      <div className="auth-form-content">
        <div className="auth-form-heading">
          <span className="auth-step-label">STEP 02 · 6-DIGIT OTP VERIFICATION</span>
          <h3>Check your inbox</h3>
          <p>Enter the 6-digit code we sent to <strong>{email}</strong> to {isRegister ? "finish creating your account" : "complete sign in"}.</p>
        </div>

        {error && <div role="alert" className="auth-alert auth-alert-error">{error}</div>}
        {message && <div role="status" className="auth-alert auth-alert-success">{message}</div>}

        <form onSubmit={handleOtpSubmit} className="auth-fields">
          <div className="auth-field">
            <label htmlFor="auth-otp">6-digit verification code</label>
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
            <span>{loading ? "Verifying…" : isRegister ? "Verify 6-digit OTP & create account" : "Verify 6-digit OTP & sign in"}</span>
            <span className="auth-button-arrow" aria-hidden="true">↗</span>
          </button>
        </form>

        <div className="auth-otp-actions">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setStep("details");
              setOtp("");
              setMessage("");
              setError("");
            }}
          >
            {isRegister ? "Change details" : "Back"}
          </button>
          <button type="button" disabled={loading} onClick={() => void handleResendOtp()}>
            Resend 6-digit code
          </button>
        </div>

        <div className="auth-security-note">
          <span className="auth-security-icon" aria-hidden="true">✦</span>
          <span>Never share this 6-digit code with anyone. Your password is stored with bcrypt encryption.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-form-content">
      <div className="auth-form-heading">
        <span className="auth-step-label">{isRegister ? "STEP 01 · CREATE YOUR INFINITY ACCOUNT" : "STEP 01 · SECURE SIGN IN"}</span>
        <h3>{isRegister ? "Create your account" : "Welcome back"}</h3>
        <p>
          {isRegister
            ? `Set up your ${accountLabel} profile, choose a password, and verify with a 6-digit OTP.`
            : `Sign in to your ${accountLabel} account using your email, password, and a 6-digit OTP.`}
        </p>
      </div>

      {error && <div role="alert" className="auth-alert auth-alert-error">{error}</div>}
      {message && <div role="status" className="auth-alert auth-alert-success">{message}</div>}

      <form onSubmit={handleSubmit} className="auth-fields">
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
                placeholder={accountType === "business" ? "e.g. Infinity Technologies" : "e.g. Your full name"}
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

        <div className="auth-field">
          <label htmlFor="auth-password">Password</label>
          <div style={{ display: "flex", alignItems: "center", position: "relative", width: "100%" }}>
            <input
              id="auth-password"
              type={showPassword ? "text" : "password"}
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              minLength={isRegister ? 8 : 1}
              maxLength={72}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isRegister ? "Create a password (8+ characters)" : "Enter your password"}
              style={{ width: "100%", paddingRight: "42px" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute",
                right: "10px",
                background: "transparent",
                border: "none",
                color: "#e11d48",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "4px",
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {isRegister && <span className="auth-field-hint">Use at least 8 characters.</span>}
        </div>

        {isRegister && (
          <div className="auth-field">
            <label htmlFor="auth-confirm-password">Confirm password</label>
            <div style={{ display: "flex", alignItems: "center", position: "relative", width: "100%" }}>
              <input
                id="auth-confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Enter your password again"
                style={{ width: "100%", paddingRight: "42px" }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: "10px",
                  background: "transparent",
                  border: "none",
                  color: "#e11d48",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "4px",
                }}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        )}

        <button type="submit" disabled={loading} className="auth-primary-button">
          <span>{loading ? "Sending 6-digit OTP…" : isRegister ? "Continue & send 6-digit OTP" : "Verify password & send 6-digit OTP"}</span>
          <span className="auth-button-arrow" aria-hidden="true">↗</span>
        </button>
      </form>

      <div className="auth-security-note">
        <span className="auth-security-icon" aria-hidden="true">✦</span>
        <span>{isRegister ? "Passwords are encrypted with bcrypt and verified with a 6-digit email OTP." : "Two-step protection: password check plus a 6-digit email OTP."}</span>
      </div>
    </div>
  );
}
