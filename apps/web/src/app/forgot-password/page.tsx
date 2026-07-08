"use client";

import { useState } from "react";
import { PublicRoute } from "@/components/RouteGuards";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { AuthStateCard } from "@/components/auth/AuthStateCard";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/error-handling";
import Link from "next/link";
import { resetBrowserPasswordForEmail } from "@/features/account/client";

function ForgotPasswordContent() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await resetBrowserPasswordForEmail(email, redirectTo);
      if (error) throw error;
      setSent(true);
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "").toLowerCase();
      if (msg.includes("rate") || msg.includes("limit")) {
        toast.error("Too many requests. Please wait a few minutes and try again.");
      } else if (msg.includes("fetch") || msg.includes("network")) {
        toast.error("Network error. Check your connection and try again.");
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
        <div className="dg-auth-logo-block" style={{ gap: "8px" }}>
          <DubGridLogo size={44} />
          <DubGridWordmark />
        </div>

        {sent ? (
          <AuthStateCard
            icon="mail"
            heading="Check your email"
            message={
              <>
                If an account exists for <strong>{email}</strong>, we&apos;ve sent a password reset
                link. Check your inbox and spam folder.
              </>
            }
            secondaryCta={{ label: "Back to login", href: "/login" }}
          />
        ) : (
          <>
            <h1 className="dg-auth-heading" style={{ marginBottom: "8px" }}>
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
              Enter your email address and we&apos;ll send you a link to reset your password.
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
                <label htmlFor="forgot-email" className="dg-auth-field-label">
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  disabled={loading}
                  className="dg-auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="dg-auth-submit"
                style={{
                  marginTop: "4px",
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
                className="dg-auth-link"
                style={{
                  color: "var(--color-text-subtle)",
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
