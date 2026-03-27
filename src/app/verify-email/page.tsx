"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { PublicRoute } from "@/components/RouteGuards";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import Link from "next/link";
import { Mail } from "lucide-react";

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
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === "SIGNED_IN") {
        window.location.replace("/dashboard");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Cooldown timer
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  async function handleResend() {
    if (!email || cooldown > 0) return;
    setResending(true);

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });
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
      toast.error("Failed to resend email. Please try again later.");
    } finally {
      setResending(false);
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
          Verify Your Email
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
          {email ? (
            <>
              We&apos;ve sent a verification link to{" "}
              <strong>{email}</strong>. Click the link in your email to verify
              your account.
            </>
          ) : (
            <>
              Check your email for a verification link to complete your
              registration.
            </>
          )}
        </p>

        {email && (
          <button
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            style={{
              width: "100%",
              padding: "13px",
              background:
                cooldown > 0
                  ? "var(--color-bg-secondary)"
                  : "var(--color-brand)",
              color:
                cooldown > 0
                  ? "var(--color-text-muted)"
                  : "var(--color-text-inverse)",
              border: "none",
              borderRadius: "999px",
              fontSize: "var(--dg-fs-body)",
              fontWeight: 600,
              cursor:
                resending || cooldown > 0 ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: resending ? 0.85 : 1,
              marginBottom: "16px",
            }}
          >
            <ButtonLoading
              loading={resending}
              spinnerColor="var(--color-text-inverse)"
              spinnerSize={28}
            >
              {cooldown > 0
                ? `Resend in ${cooldown}s`
                : "Resend Verification Email"}
            </ButtonLoading>
          </button>
        )}

        <p
          style={{
            fontSize: "var(--dg-fs-caption)",
            color: "var(--color-text-subtle)",
            textAlign: "center",
            marginBottom: "16px",
          }}
        >
          Didn&apos;t receive the email? Check your spam folder or try resending.
        </p>

        <div style={{ textAlign: "center" }}>
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
