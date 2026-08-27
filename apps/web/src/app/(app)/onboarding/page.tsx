"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/Button";
import { useRouter } from "next/navigation";
import { DubGridLogo } from "@/components/Logo";
import { fetchAccountIdentity } from "@/features/account/client";
import { ButtonLoading } from "@/components/ButtonSpinner";

export default function OnboardingPage() {
  const { user, signOut, isLoading: isAuthLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isAuthLoading) return;

    if (user) {
      setLoading(false);
    } else {
      router.replace("/login");
    }
  }, [user, isAuthLoading, router]);

  // Auto-poll for org assignment every 15s, capped at ~5 minutes
  const pollCountRef = useRef(0);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  useEffect(() => {
    if (!user) return;
    pollCountRef.current = 0;
    pollRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > 20) {
        if (pollRef.current) clearInterval(pollRef.current);
        setPollTimedOut(true);
        return;
      }
      setChecking(true);
      try {
        const identity = await fetchAccountIdentity();
        if (identity.hasOrganizationMembership) {
          if (pollRef.current) clearInterval(pollRef.current);
          window.location.reload();
          return;
        }
      } catch {
        // silently retry next interval
      } finally {
        setChecking(false);
      }
    }, 15000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user]);

  if (isAuthLoading || loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        }}
      >
        Loading
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "24px",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        background:
          "linear-gradient(to bottom, var(--dg-color-bg) 0%, var(--dg-color-brand-bg) 100%)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          padding: "48px 40px",
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(16px)",
          borderRadius: "24px",
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.1)",
          textAlign: "center",
          border: "1px solid rgba(255, 255, 255, 0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "32px" }}>
          <div
            style={{
              padding: "16px",
              background: "var(--dg-color-brand)",
              borderRadius: "20px",
              boxShadow: "0 8px 16px rgba(37, 99, 235, 0.25)",
            }}
          >
            <DubGridLogo size={40} color="var(--dg-color-text-inverse)" />
          </div>
        </div>

        <h1
          style={{
            fontSize: "var(--dg-fs-page-title)",
            fontWeight: 800,
            marginBottom: "16px",
            color: "var(--dg-color-text-primary)",
            letterSpacing: "-0.03em",
          }}
        >
          Pending Organization Assignment
        </h1>

        <p
          style={{
            fontSize: "16px",
            color: "var(--dg-color-text-muted)",
            lineHeight: 1.6,
            marginBottom: "40px",
          }}
        >
          Your account has been successfully created, but you haven&apos;t been assigned to an
          organization yet. Please contact your administrator and ask them to invite you to their
          organization.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Button
            onClick={() => window.location.reload()}
            style={{
              width: "100%",
              padding: "14px",
              background: "var(--dg-color-brand)",
              color: "var(--dg-color-text-inverse)",
              border: "none",
              borderRadius: "12px",
              fontSize: "16px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "transform 150ms ease, box-shadow 150ms ease",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)",
            }}
          >
            <ButtonLoading loading={checking}>I've been invited — refresh</ButtonLoading>
          </Button>

          {pollTimedOut && (
            <p style={{ fontSize: "14px", color: "var(--dg-color-warning-text)", margin: 0 }}>
              You're not in an organization yet. Ask your administrator to add you.
            </p>
          )}

          <Button
            onClick={signOut}
            style={{
              width: "100%",
              padding: "14px",
              background: "var(--dg-color-bg-secondary)",
              color: "var(--dg-color-text-muted)",
              border: "none",
              borderRadius: "12px",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 150ms ease",
            }}
          >
            Sign Out
          </Button>
        </div>

        <div
          style={{
            marginTop: "40px",
            paddingTop: "24px",
            borderTop: "1px solid var(--dg-color-bg-secondary)",
          }}
        >
          <p style={{ fontSize: "14px", color: "var(--dg-color-text-subtle)" }}>
            Setting up a new facility? <br />
            <a
              href="mailto:support@dubgrid.com"
              style={{ color: "var(--dg-color-link)", fontWeight: 600, textDecoration: "none" }}
            >
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
