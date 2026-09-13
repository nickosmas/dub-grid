"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { Button } from "@/components/Button";
import { AuthStateCard } from "@/components/auth/AuthStateCard";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { verifyBrowserOtp } from "@/features/account/client";
import { ApexLandingLink } from "@/components/auth/ApexLandingLink";
import { resolveAuthActionDestination } from "@/lib/auth/integrity-contract";
import { markBrowserRecoveryVerified } from "@/lib/auth/browser-recovery-capability";
import { scrubBrowserSecretQuery } from "@/lib/auth/browser-secret-query";

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

  const [credential] = useState(() => ({
    tokenHash: searchParams.get("token_hash"),
    authAction: resolveAuthActionDestination(searchParams.get("type"), searchParams.get("next")),
  }));
  const { tokenHash, authAction } = credential;
  const isRecovery = authAction?.action === "recovery";

  useEffect(() => {
    scrubBrowserSecretQuery(["token_hash", "type", "next"]);
  }, []);

  async function handleVerify() {
    if (!tokenHash || !authAction) {
      setError(true);
      return;
    }

    setLoading(true);
    const { error: verifyError } = await verifyBrowserOtp({
      type: authAction.action,
      token_hash: tokenHash,
    });

    if (verifyError) {
      setError(true);
      setLoading(false);
    } else {
      markBrowserRecoveryVerified();
      router.replace(authAction.destination);
    }
  }

  return (
    <PageShell>
      <Card>
        <ApexLandingLink className="dg-auth-logo-block dg-auth-logo-block--compact">
          <DubGridLogo size={44} />
          <DubGridWordmark />
        </ApexLandingLink>

        {!tokenHash || !authAction || error ? (
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
            <Button
              onClick={handleVerify}
              disabled={loading}
              className="dg-btn dg-btn-primary dg-btn-lg dg-auth-state-primary"
            >
              <ButtonLoading
                loading={loading}
                spinnerColor="var(--dg-color-text-inverse)"
                spinnerSize={20}
              >
                Continue
              </ButtonLoading>
            </Button>
          </AuthStateCard>
        )}
      </Card>
    </PageShell>
  );
}
