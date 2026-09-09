"use client";

import { useRef, useState } from "react";
import { PublicRoute } from "@/components/RouteGuards";
import { Form } from "@/components/Form";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { AuthStateCard } from "@/components/auth/AuthStateCard";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import Link from "next/link";
import { resetBrowserPasswordForEmail } from "@/features/account/client";
import { ApexLandingLink } from "@/components/auth/ApexLandingLink";
import { settleWithRequestTimeout } from "@/lib/fetch-with-timeout";
import { getWebAuthRecoveryMessage } from "@/lib/auth-recovery";
import { isRetryableAuthRecoveryError } from "@dubgrid/client-errors";

function ForgotPasswordContent() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const submittingRef = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);

    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await settleWithRequestTimeout(
        resetBrowserPasswordForEmail(email, redirectTo),
      );
      if (error) throw error;
      setSent(true);
    } catch (err: unknown) {
      if (isRetryableAuthRecoveryError(err)) {
        toast.error(getWebAuthRecoveryMessage(err, "We couldn't send the reset link. Try again."));
      } else {
        // Always show success to prevent email enumeration
        setSent(true);
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <PageShell>
      <Card>
        {/* Logo */}
        <ApexLandingLink className="dg-auth-logo-block dg-auth-logo-block--compact">
          <DubGridLogo size={44} />
          <DubGridWordmark />
        </ApexLandingLink>

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
            <h1 className="dg-auth-heading dg-auth-page-heading">Forgot password</h1>
            <p className="dg-auth-description">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>

            <Form onSubmit={handleSubmit} className="dg-auth-form">
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
                className="dg-btn dg-btn-primary dg-btn-lg dg-auth-submit"
              >
                <ButtonLoading
                  loading={loading}
                  spinnerColor="var(--dg-color-text-inverse)"
                  spinnerSize={20}
                >
                  Send Reset Link
                </ButtonLoading>
              </button>
            </Form>

            <div className="dg-auth-back-link">
              <Link href="/login" className="dg-auth-link dg-auth-link--subtle">
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
