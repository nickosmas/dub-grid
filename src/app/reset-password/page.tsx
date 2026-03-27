"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { PublicRoute } from "@/components/RouteGuards";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/error-handling";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

type PageState = "loading" | "form" | "success" | "error";

function ResetPasswordContent() {
  const [state, setState] = useState<PageState>("loading");
  const stateRef = useRef<PageState>("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Check for error flag from /auth/confirm route (invalid/expired token)
    if (params.get("error") === "invalid_link") {
      setState("error");
      stateRef.current = "error";
      return;
    }

    // PKCE flow: Supabase redirects here with ?code=xxx after the user clicks
    // the email link. Exchange it client-side where the code_verifier cookie
    // (set when resetPasswordForEmail was called) is available.
    const code = params.get("code");
    if (code) {
      // Clean the code from the URL so it can't be reused / bookmarked
      window.history.replaceState({}, "", window.location.pathname);

      supabase.auth.exchangeCodeForSession(code).then(({ error }: { error: unknown }) => {
        if (error) {
          setState("error");
          stateRef.current = "error";
        } else {
          setState("form");
          stateRef.current = "form";
        }
      });
    } else {
      // No code — check if session already exists (e.g. from /auth/confirm).
      void supabase.auth.getSession().then((res: { data: { session: unknown } }) => {
        if (res.data.session && stateRef.current === "loading") {
          setState("form");
          stateRef.current = "form";
        }
      });
    }

    // Fallback: listen for PASSWORD_RECOVERY event (handles implicit flow
    // or other edge cases where the token arrives via URL hash).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === "PASSWORD_RECOVERY") {
        setState("form");
        stateRef.current = "form";
      }
    });

    // Timeout fallback — if nothing resolves within 15s, the link is invalid/expired.
    const timeout = setTimeout(() => {
      if (stateRef.current === "loading") {
        setState("error");
        stateRef.current = "error";
      }
    }, 15000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }
    if (password.length < 10) {
      setFormError("Password must be at least 10 characters");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });
      if (error) throw error;

      // Sign out so user re-authenticates with fresh credentials
      await supabase.auth.signOut({ scope: "local" });

      setState("success");
      stateRef.current = "success";
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "").toLowerCase();
      if (msg.includes("same password") || msg.includes("different")) {
        setFormError("New password must be different from your current password.");
      } else if (msg.includes("weak") || msg.includes("short")) {
        setFormError("Password is too weak. Please choose a stronger password.");
      } else if (msg.includes("fetch") || msg.includes("network")) {
        toast.error("Network error — please check your connection.");
      } else {
        toast.error("Failed to update password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell>
      <Card>
        {/* Logo */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            marginBottom: "28px",
          }}
        >
          <DubGridLogo size={44} />
          <DubGridWordmark />
        </div>

        {state === "loading" ? (
          <>
            <h1
              style={{
                fontSize: "var(--dg-fs-card-title)",
                fontWeight: 700,
                color: "var(--color-text-primary)",
                marginBottom: "12px",
                textAlign: "center",
              }}
            >
              Verifying Reset Link...
            </h1>
            <p
              style={{
                fontSize: "var(--dg-fs-body-sm)",
                color: "var(--color-text-muted)",
                textAlign: "center",
              }}
            >
              Please wait while we verify your password reset link.
            </p>
          </>
        ) : state === "error" ? (
          <>
            <h1
              style={{
                fontSize: "var(--dg-fs-card-title)",
                fontWeight: 700,
                color: "var(--color-text-primary)",
                marginBottom: "12px",
                textAlign: "center",
              }}
            >
              Invalid or Expired Link
            </h1>
            <p
              style={{
                fontSize: "var(--dg-fs-body-sm)",
                color: "var(--color-text-muted)",
                lineHeight: 1.5,
                textAlign: "center",
                marginBottom: "24px",
              }}
            >
              This password reset link is invalid or has expired. Please request
              a new one.
            </p>
            <Link
              href="/forgot-password"
              style={{
                display: "block",
                width: "100%",
                padding: "13px",
                background: "var(--color-brand)",
                color: "var(--color-text-inverse)",
                border: "none",
                borderRadius: "999px",
                fontSize: "var(--dg-fs-body)",
                fontWeight: 600,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Request New Link
            </Link>
            <div style={{ marginTop: "16px", textAlign: "center" }}>
              <Link
                href="/login"
                style={{
                  fontSize: "var(--dg-fs-label)",
                  color: "var(--color-text-subtle)",
                  textDecoration: "underline",
                }}
              >
                Back to login
              </Link>
            </div>
          </>
        ) : state === "success" ? (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "var(--color-success-bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CheckCircle size={28} color="var(--color-success)" />
              </div>
            </div>
            <h1
              style={{
                fontSize: "var(--dg-fs-card-title)",
                fontWeight: 700,
                color: "var(--color-text-primary)",
                marginBottom: "12px",
                textAlign: "center",
              }}
            >
              Password Updated
            </h1>
            <p
              style={{
                fontSize: "var(--dg-fs-body-sm)",
                color: "var(--color-text-muted)",
                lineHeight: 1.5,
                textAlign: "center",
                marginBottom: "24px",
              }}
            >
              Your password has been successfully reset. You can now sign in with
              your new password.
            </p>
            <Link
              href="/login"
              style={{
                display: "block",
                width: "100%",
                padding: "13px",
                background: "var(--color-brand)",
                color: "var(--color-text-inverse)",
                border: "none",
                borderRadius: "999px",
                fontSize: "var(--dg-fs-body)",
                fontWeight: 600,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Sign In
            </Link>
          </>
        ) : (
          <>
            <h1
              style={{
                fontSize: "var(--dg-fs-card-title)",
                fontWeight: 700,
                color: "var(--color-text-primary)",
                marginBottom: "8px",
                textAlign: "center",
              }}
            >
              Set New Password
            </h1>
            <p
              style={{
                fontSize: "var(--dg-fs-body-sm)",
                color: "var(--color-text-muted)",
                lineHeight: 1.5,
                textAlign: "center",
                marginBottom: "24px",
              }}
            >
              Choose a strong password with at least 10 characters.
            </p>

            <form
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 600,
                    marginBottom: "6px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  New Password
                </label>
                <PasswordInput
                  placeholder="Enter new password"
                  value={password}
                  onChange={setPassword}
                  showPassword={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  autoComplete="new-password"
                  ariaDescribedBy="password-strength-label"
                  disabled={loading}
                />
                {password.length > 0 && (
                  <PasswordStrength password={password} />
                )}
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 600,
                    marginBottom: "6px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Confirm Password
                </label>
                <PasswordInput
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  showPassword={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>

              {formError && (
                <p
                  style={{
                    color: "var(--color-danger-dark)",
                    fontSize: "var(--dg-fs-body-sm)",
                    margin: 0,
                  }}
                >
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: "4px",
                  width: "100%",
                  padding: "13px",
                  background: "var(--color-brand)",
                  color: "var(--color-text-inverse)",
                  border: "none",
                  borderRadius: "999px",
                  fontSize: "var(--dg-fs-body)",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  opacity: loading ? 0.85 : 1,
                }}
              >
                <ButtonLoading
                  loading={loading}
                  spinnerColor="var(--color-text-inverse)"
                  spinnerSize={28}
                >
                  Reset Password
                </ButtonLoading>
              </button>
            </form>
          </>
        )}
      </Card>
    </PageShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <PublicRoute>
      <ResetPasswordContent />
    </PublicRoute>
  );
}
