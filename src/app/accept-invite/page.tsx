"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { acceptInvitation } from "@/lib/db";

type PageState = "loading" | "no-token" | "form" | "processing" | "success" | "error";

export default function AcceptInvitePage() {
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailFromUrl, setEmailFromUrl] = useState(false);

  // Extract token and email from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    const emailParam = params.get("email");
    if (!t) {
      setState("no-token");
    } else {
      setToken(t);
      if (emailParam) {
        setEmail(emailParam);
        setEmailFromUrl(true);
      }
      setState("form");
    }
  }, []);

  function getLoginUrl(slug: string | null) {
    if (!slug) return "/login";
    // Validate slug to prevent open redirect via crafted slug values
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug)) return "/login";
    const host = window.location.host;
    const protocol = window.location.protocol;
    if (host.startsWith(`${slug}.`)) return "/login";
    const parts = host.split(".");
    const baseDomain = parts.length >= 2 ? parts.slice(-2).join(".") : host;
    return `${protocol}//${slug}.${baseDomain}/login`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setFormError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setState("processing");

    try {
      // 1. Sign up — create the Supabase auth account
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        throw new Error(signUpError.message);
      }

      // If no session (email confirmation required or user already exists),
      // try signing in directly
      if (data.user && !data.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          throw new Error(
            signInError.message.toLowerCase().includes("email not confirmed")
              ? "Please check your email to confirm your account, then try again."
              : signInError.message
          );
        }
      }

      // 2. Accept the invitation (now authenticated)
      let slug: string | null = null;
      try {
        const result = await acceptInvitation(token!);
        slug = result.orgSlug;
      } catch (acceptErr: any) {
        const msg: string = acceptErr?.message ?? "";
        // "Already accepted" is fine — just proceed to success
        if (!msg.toLowerCase().includes("already been accepted")) {
          throw new Error(
            "Your account was created, but this invitation is no longer valid. " +
            "Please contact your organization administrator for a new invitation."
          );
        }
        // Try to look up the org slug for redirect
        try {
          const { data: inv } = await supabase
            .from("invitations")
            .select("org_id, organizations(slug)")
            .eq("token", token!)
            .maybeSingle();
          slug = (inv?.organizations as any)?.slug ?? null;
        } catch {
          // Best-effort
        }
      }

      // 3. Sign out so user re-authenticates with fresh JWT claims.
      // Use global scope to revoke the server-side refresh token too,
      // otherwise the login page will find a stale token in cookies.
      await supabase.auth.signOut({ scope: "global" });

      setOrgSlug(slug);
      setState("success");
    } catch (err: any) {
      console.error("[accept-invite] Error:", err);
      setFormError(err?.message ?? "Something went wrong. Please try again.");
      setState("form");
      setLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "24px",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        background: "linear-gradient(135deg, var(--color-bg) 0%, var(--color-info-bg) 100%)",
      }}
    >
      <div
        className="dg-auth-card"
        style={{
          maxWidth: "480px",
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(16px)",
          borderRadius: "24px",
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.1)",
          textAlign: "center",
          border: "1px solid rgba(255, 255, 255, 0.5)",
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            marginBottom: "32px",
          }}
        >
          <DubGridLogo size={52} />
          <DubGridWordmark />
        </div>

        {state === "loading" || state === "processing" ? (
          <LoadingState
            message={state === "processing" ? "Setting up your account..." : "Loading..."}
          />
        ) : state === "no-token" ? (
          <ErrorState
            title="Invalid Link"
            message="This invitation link is missing a token. Please check the link you received and try again."
          />
        ) : state === "form" ? (
          <>
            <h1 style={headingStyle}>Accept Invitation</h1>
            <p style={subtextStyle}>
              Set your password to join your organization.
            </p>

            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <input
                type="email"
                placeholder="Email"
                className="dg-standalone-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                readOnly={emailFromUrl}
                style={{
                  ...inputStyle,
                  ...(emailFromUrl
                    ? { background: "var(--color-bg-secondary)", color: "var(--color-text-subtle)" }
                    : {}),
                }}
              />

              <div>
                <PasswordInput
                  placeholder="Password"
                  value={password}
                  onChange={setPassword}
                  showPassword={showPassword}
                  onToggle={() => setShowPassword(!showPassword)}
                  ariaDescribedBy="password-strength-label"
                />
                {password.length > 0 && <PasswordStrength password={password} />}
              </div>
              <PasswordInput
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                showPassword={showPassword}
                onToggle={() => setShowPassword(!showPassword)}
              />

              {formError && (
                <p style={{ color: "var(--color-danger-dark)", fontSize: "var(--dg-fs-body-sm)", margin: 0, textAlign: "left" }}>
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  ...primaryButtonStyle,
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Setting up..." : "Set Password & Accept"}
              </button>
            </form>
          </>
        ) : state === "success" ? (
          <SuccessState orgSlug={orgSlug} getLoginUrl={getLoginUrl} />
        ) : state === "error" ? (
          <ErrorState
            title="Invitation Failed"
            message={error ?? "An unexpected error occurred."}
          />
        ) : null}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PasswordInput({
  placeholder,
  value,
  onChange,
  showPassword,
  onToggle,
  ariaDescribedBy,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  showPassword: boolean;
  onToggle: () => void;
  ariaDescribedBy?: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        className="dg-standalone-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={6}
        aria-describedby={ariaDescribedBy}
        style={{ ...inputStyle, paddingRight: 48 }}
      />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 4,
          color: "var(--color-text-subtle)",
          display: "flex",
          alignItems: "center",
        }}
        aria-label={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <>
      <h1 style={headingStyle}>{message}</h1>
      <p style={subtextStyle}>Please wait while we process your invitation.</p>
    </>
  );
}

function SuccessState({
  orgSlug,
  getLoginUrl,
}: {
  orgSlug: string | null;
  getLoginUrl: (slug: string | null) => string;
}) {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          window.location.href = getLoginUrl(orgSlug);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <h1 style={headingStyle}>You&apos;re All Set</h1>
      <p style={subtextStyle}>
        Your account has been created and invitation accepted.
        Redirecting to sign in{countdown > 0 ? ` in ${countdown}...` : "..."}
      </p>
      <button
        onClick={() => (window.location.href = getLoginUrl(orgSlug))}
        style={primaryButtonStyle}
      >
        Sign In Now
      </button>
    </>
  );
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <>
      <h1 style={headingStyle}>{title}</h1>
      <p style={subtextStyle}>{message}</p>
      <button
        onClick={() => (window.location.href = "/login")}
        style={secondaryButtonStyle}
      >
        Go to Login
      </button>
    </>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const level = password.length < 8 ? 0 : password.length < 10 ? 1 : /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password) ? 3 : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 2 : 1;
  const labels = ["Too short", "Weak", "Fair", "Strong"];
  const colors = ["var(--color-danger)", "var(--color-warning)", "var(--color-warning)", "var(--color-success)"];
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }} role="meter" aria-label="Password strength" aria-valuenow={level} aria-valuemin={0} aria-valuemax={3}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= level ? colors[level] : "var(--color-border-light)", transition: "background 150ms ease" }} />
        ))}
      </div>
      <span id="password-strength-label" style={{ fontSize: "var(--dg-fs-caption)", color: colors[level], fontWeight: 500 }}>
        {labels[level]}
      </span>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const headingStyle: React.CSSProperties = {
  fontSize: "var(--dg-fs-page-title)",
  fontWeight: 800,
  marginBottom: "16px",
  color: "var(--color-text-primary)",
  letterSpacing: "-0.03em",
};

const subtextStyle: React.CSSProperties = {
  fontSize: "var(--dg-fs-title)",
  color: "var(--color-text-muted)",
  lineHeight: 1.6,
  marginBottom: "24px",
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px",
  background: "var(--color-brand)",
  color: "var(--color-text-inverse)",
  border: "none",
  borderRadius: "12px",
  fontSize: "var(--dg-fs-title)",
  fontWeight: 700,
  cursor: "pointer",
  transition: "transform 150ms ease, box-shadow 150ms ease",
  boxShadow: "0 4px 12px rgba(27, 58, 45, 0.15)",
};

const secondaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px",
  background: "var(--color-bg-secondary)",
  color: "var(--color-text-muted)",
  border: "none",
  borderRadius: "12px",
  fontSize: "var(--dg-fs-body)",
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 150ms ease",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  background: "var(--color-bg)",
  border: "1px solid var(--color-border-light)",
  borderRadius: "12px",
  fontSize: "var(--dg-fs-body)",
  color: "var(--color-text-primary)",
  outline: "none",
  transition: "border-color 150ms ease",
  boxSizing: "border-box",
};
