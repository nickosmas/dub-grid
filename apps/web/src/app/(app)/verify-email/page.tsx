"use client";

import { useState, useEffect, useRef } from "react";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { PublicRoute } from "@/components/RouteGuards";
import { Button } from "@/components/Button";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { AuthStateCard } from "@/components/auth/AuthStateCard";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import Link from "next/link";
import { resendBrowserSignupEmail, subscribeToBrowserAuthChanges } from "@/features/account/client";

function VerifyEmailContent() {
  const [email, setEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get("email"));
  }, []);

  // Listen for successful sign-in (email confirmed externally)
  useEffect(() => {
    const {
      data: { subscription },
    } = subscribeToBrowserAuthChanges((event: AuthChangeEvent) => {
      if (event === "SIGNED_IN") {
        window.location.replace("/dashboard");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Cooldown timer cleanup
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  async function handleResend() {
    if (!email || cooldown > 0) return;
    setResending(true);

    try {
      const { error } = await resendBrowserSignupEmail(email);
      if (error) throw error;
      toast.success("Verification email sent. Check your inbox.");

      // Start 60-second cooldown
      setCooldown(60);
      cooldownRef.current = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      toast.error("We couldn't resend that email. Try again in a moment.");
    } finally {
      setResending(false);
    }
  }

  return (
    <PageShell>
      <Card>
        {/* Logo */}
        <div className="dg-auth-logo-block dg-auth-logo-block--compact">
          <DubGridLogo size={44} />
          <DubGridWordmark />
        </div>

        <AuthStateCard
          icon="mail"
          heading="Verify your email"
          message={
            email ? (
              <>
                We&apos;ve sent a verification link to <strong>{email}</strong>. Click the link in
                your email to verify your account.
              </>
            ) : (
              <>Check your email for a verification link to complete your registration.</>
            )
          }
        >
          {email && (
            <Button
              onClick={handleResend}
              disabled={resending || cooldown > 0}
              className="dg-btn dg-btn-secondary dg-btn-lg dg-auth-resend"
            >
              <ButtonLoading
                loading={resending}
                loadingLabel="Sending"
                spinnerColor="var(--dg-color-text-muted)"
                spinnerSize={20}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification email"}
              </ButtonLoading>
            </Button>
          )}

          <p className="dg-auth-footnote">
            Didn&apos;t receive the email? Check your spam folder or try resending.
          </p>

          <div className="dg-auth-centered">
            <Link href="/login" className="dg-auth-link dg-auth-link--subtle">
              Back to login
            </Link>
          </div>
        </AuthStateCard>
      </Card>
    </PageShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <PublicRoute>
      <VerifyEmailContent />
    </PublicRoute>
  );
}
