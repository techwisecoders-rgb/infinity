"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  Check,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { AuthForm } from "@/components/auth/AuthForm";
import "./login.css";

type AccountType = "personal" | "creator" | "business";

const accountOptions: Array<{
  value: AccountType;
  label: string;
  description: string;
  icon: typeof UserRound;
}> = [
  { value: "personal", label: "User", description: "", icon: UserRound },
  { value: "creator", label: "Work", description: "", icon: BriefcaseBusiness },
  { value: "business", label: "Business", description: "", icon: Building2 },
];

function safeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accountType, setAccountType] = useState<AccountType>("personal");
  const [showRegister, setShowRegister] = useState(false);
  const [redirectTo, setRedirectTo] = useState("/");

  useEffect(() => {
    const requestedType = searchParams.get("type");
    if (requestedType === "personal" || requestedType === "creator" || requestedType === "business") {
      setAccountType(requestedType);
    }

    setRedirectTo(safeRedirectPath(searchParams.get("next")));
    setShowRegister(searchParams.get("register") === "true");
  }, [searchParams]);

  function updateQuery(nextType: AccountType, register: boolean) {
    const params = new URLSearchParams(window.location.search);
    params.set("type", nextType);
    if (register) params.set("register", "true");
    else params.delete("register");
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }

  const handleLoginSuccess = (data: any) => {
    try {
      localStorage.setItem("userData", JSON.stringify(data));
      if (data?.profile?.account_type) {
        localStorage.setItem("infinityActiveAccountType", data.profile.account_type);
        localStorage.setItem("infinityActivePageView", data.profile.account_type);
      }
    } catch (storageError) {
      console.warn("Could not cache the signed-in user in this browser.", storageError);
    }
    const targetPath = redirectTo === "/" ? "/?openProfile=1" : redirectTo;
    router.replace(targetPath);
    router.refresh();
  };

  return (
    <main className="auth-page">
      <div className="auth-background-glow auth-background-glow-cyan" aria-hidden="true" />
      <div className="auth-background-glow auth-background-glow-pink" aria-hidden="true" />
      <div className="auth-grid-pattern" aria-hidden="true" />

      <header className="auth-topbar">
        <a href="/" className="auth-brand" aria-label="Infinity home">
          <span className="auth-brand-mark">∞</span>
          <span className="auth-brand-word">INFINITY</span>
          <span className="auth-brand-divider" />
          <span className="auth-brand-caption">SOCIAL ECOSYSTEM</span>
        </a>
        <a href="/" className="auth-back-link"><ArrowLeft size={15} /> Back to home</a>
      </header>

      <div className="auth-layout">
<section className="auth-workspace" aria-label={showRegister ? "Create an account" : "Sign in"}>
          <div className="auth-card-topline"><span /><span /><span /></div>
          <div className="auth-card">
            <div className="auth-card-eyebrow">
              <span className="auth-card-eyebrow-icon"><ShieldCheck size={16} /></span>
              <span>SECURE ACCESS</span>
              <span className="auth-card-eyebrow-line" />
              <span className="auth-encrypted-label">ENCRYPTED</span>
            </div>

            <div className="auth-card-heading">
              <h2>{showRegister ? "Join Infinity." : "Welcome back."}</h2>
            </div>

            <div className="auth-mode-switch" aria-label="Authentication mode">
              <button
                type="button"
                className={!showRegister ? "active" : ""}
                aria-pressed={!showRegister}
                onClick={() => { setShowRegister(false); updateQuery(accountType, false); }}
              >
                Sign in
              </button>
              <button
                type="button"
                className={showRegister ? "active" : ""}
                aria-pressed={showRegister}
                onClick={() => { setShowRegister(true); updateQuery(accountType, true); }}
              >
                Create account <ArrowUpRight size={14} />
              </button>
            </div>

            <div className="auth-account-heading">
              <span>ACCOUNT TYPE</span>
              <span className="auth-account-step">01 / 02</span>
            </div>
            <div className="auth-account-options">
              {accountOptions.map((option) => {
                const Icon = option.icon;
                const selected = accountType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setAccountType(option.value);
                      updateQuery(option.value, showRegister);
                    }}
                    className={`auth-account-option${selected ? " selected" : ""}`}
                  >
                    <Icon size={19} strokeWidth={1.8} />
                    <span className="auth-account-option-text"><strong>{option.label}</strong><small>{option.description}</small></span>
                    <span className="auth-account-radio">{selected && <Check size={11} />}</span>
                  </button>
                );
              })}
            </div>

            <div className="auth-form-divider"><span /> <span>{showRegister ? "YOUR DETAILS" : "SIGN IN DETAILS"}</span> <span /></div>

            <AuthForm
              key={`${accountType}-${showRegister ? "register" : "login"}`}
              onSuccess={handleLoginSuccess}
              accountType={accountType}
              mode={showRegister ? "register" : "login"}
            />

            <div className="auth-card-footer">
              <span>By continuing, you agree to use Infinity responsibly.</span>
              <span className="auth-card-footer-mark">∞</span>
            </div>
          </div>
          <div className="auth-help-line">Password sign-in and secure registration powered by Infinity</div>
        </section>
      </div>
      <footer className="auth-page-footer"><span>© {new Date().getFullYear()} INFINITY</span><span>CONNECT · CREATE · GROW</span></footer>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="auth-loading">Loading secure access…</main>}>
      <LoginPageContent />
    </Suspense>
  );
}
