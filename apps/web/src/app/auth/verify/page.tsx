"use client";

import { useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { useSearchParams, useRouter } from "next/navigation";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { AuthStateCard } from "@/components/auth/AuthStateCard";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { verifyBrowserOtp } from "@/features/account/client";

/**
 * Intermediate click-through page for email verification links.
 *
 * Email security scanners (Outlook SafeLinks, Gmail link prefetch, etc.)
 * pre-fetch URLs to check for malware. If the email link pointed directly
 * to the /auth/confirm server route, the scanner's GET request would consume
 * the one-time token before the user clicks it.
 *
 * This page requires a button click before verifying — scanners load pages
 * but don't click buttons, so the token stays valid for the real user.
 */
export default function AuthVerifyPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const isRecovery = type === "recovery";

  async function handleVerify() {
    if (!tokenHash || !type) {
      setError(true);
      return;
    }

    setLoading(true);
    const { error: verifyError } = await verifyBrowserOtp({
      type,
      token_hash: tokenHash,
    });

    if (verifyError) {
      setError(true);
      setLoading(false);
    } else {
      router.replace(next);
    }
  }

  return (
    <PageShell>
      <Card>
        <div className="dg-auth-logo-block" style={{ gap: "8px" }}>
          <DubGridLogo size={44} />
          <DubGridWordmark />
        </div>

        {!tokenHash || !type || error ? (
          <AuthStateCard
            heading="Invalid or expired link"
            message="This link is invalid or has expired. Please request a new one."
            primaryCta={{
              label: isRecovery ? "Request New Link" : "Back to Login",
              href: isRecovery ? "/forgot-password" : "/login",
            }}
          />
        ) : (
          <AuthStateCard
            heading={isRecovery ? "Reset your password" : "Verify your email"}
            message={
              isRecovery
                ? "Click the button below to continue to the password reset form."
                : "Click the button below to verify your email address."
            }
          >
            <button
              onClick={handleVerify}
              disabled={loading}
              className="dg-btn dg-btn-primary dg-btn-lg"
              style={{ width: "100%" }}
            >
              <ButtonLoading
                loading={loading}
                spinnerColor="var(--color-text-inverse)"
                spinnerSize={28}
              >
                Continue
              </ButtonLoading>
            </button>
          </AuthStateCard>
        )}
      </Card>
    </PageShell>
  );
}
