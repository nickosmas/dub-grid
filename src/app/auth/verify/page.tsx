"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EmailOtpType } from "@supabase/supabase-js";
import { useSearchParams, useRouter } from "next/navigation";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import Link from "next/link";

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
    const { error: verifyError } = await supabase.auth.verifyOtp({
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

  if (!tokenHash || !type || error) {
    return (
      <PageShell>
        <Card>
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
            This link is invalid or has expired. Please request a new one.
          </p>
          <Link
            href={isRecovery ? "/forgot-password" : "/login"}
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
            {isRecovery ? "Request New Link" : "Back to Login"}
          </Link>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Card>
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
        <h1
          style={{
            fontSize: "var(--dg-fs-card-title)",
            fontWeight: 700,
            color: "var(--color-text-primary)",
            marginBottom: "12px",
            textAlign: "center",
          }}
        >
          {isRecovery ? "Reset Your Password" : "Verify Your Email"}
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
          {isRecovery
            ? "Click the button below to continue to the password reset form."
            : "Click the button below to verify your email address."}
        </p>
        <button
          onClick={handleVerify}
          disabled={loading}
          style={{
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
            Continue
          </ButtonLoading>
        </button>
      </Card>
    </PageShell>
  );
}
