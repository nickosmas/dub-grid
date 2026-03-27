"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PublicRoute } from "@/components/RouteGuards";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/error-handling";
import Link from "next/link";
import { Mail } from "lucide-react";

function ForgotPasswordContent() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) throw error;
      setSent(true);
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "").toLowerCase();
      if (msg.includes("rate") || msg.includes("limit")) {
        toast.error("Too many requests. Please wait a few minutes and try again.");
      } else if (msg.includes("fetch") || msg.includes("network")) {
        toast.error("Network error — please check your connection.");
      } else {
        // Always show success to prevent email enumeration
        setSent(true);
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

        {sent ? (
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
                  background: "var(--color-brand-bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Mail size={28} color="var(--color-brand)" />
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
              Check Your Email
            </h1>
            <p
              style={{
                fontSize: "var(--dg-fs-body)",
                color: "var(--color-text-muted)",
                lineHeight: 1.6,
                textAlign: "center",
                marginBottom: "24px",
              }}
            >
              If an account exists for <strong>{email}</strong>, we&apos;ve sent
              a password reset link. Check your inbox and spam folder.
            </p>
            <Link
              href="/login"
              style={{
                display: "block",
                textAlign: "center",
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-subtle)",
                textDecoration: "underline",
              }}
            >
              Back to login
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
              Forgot Password
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
              Enter your email address and we&apos;ll send you a link to reset
              your password.
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
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  disabled={loading}
                  className="dg-standalone-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{
                    width: "100%",
                    padding: "11px 13px",
                    border: "1.5px solid var(--color-border)",
                    borderRadius: "8px",
                    fontSize: "var(--dg-fs-body)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

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
                  Send Reset Link
                </ButtonLoading>
              </button>
            </form>

            <div
              style={{
                marginTop: "20px",
                textAlign: "center",
              }}
            >
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
        )}
      </Card>
    </PageShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <PublicRoute>
      <ForgotPasswordContent />
    </PublicRoute>
  );
}
