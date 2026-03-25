"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { DubGridLogo } from "@/components/Logo";
import { supabase } from "@/lib/supabase";

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
        const { data } = await supabase
          .from("organization_memberships")
          .select("org_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.org_id) {
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
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
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
        Loading...
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
        background: "linear-gradient(135deg, var(--color-bg) 0%, var(--color-info-bg) 100%)",
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
          <div style={{ 
            padding: "16px", 
            background: "var(--color-brand)",
            borderRadius: "20px",
            boxShadow: "0 8px 16px rgba(3, 87, 202, 0.25)"
          }}>
            <DubGridLogo size={40} color="var(--color-text-inverse)" />
          </div>
        </div>

        <h1
          style={{
            fontSize: "28px",
            fontWeight: 800,
            marginBottom: "16px",
            color: "var(--color-text-primary)",
            letterSpacing: "-0.03em",
          }}
        >
          Pending Organization Assignment
        </h1>

        <p
          style={{
            fontSize: "16px",
            color:"var(--color-text-muted)",
            lineHeight: 1.6,
            marginBottom: "40px",
          }}
        >
          Your account has been successfully created, but you haven&apos;t been
          assigned to an organization yet. Please contact your administrator and
          ask them to invite you to their workspace.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              width: "100%",
              padding: "14px",
              background: "var(--color-brand)",
              color: "var(--color-text-inverse)",
              border: "none",
              borderRadius: "12px",
              fontSize: "16px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "transform 150ms ease, box-shadow 150ms ease",
              boxShadow: "0 4px 12px rgba(3, 87, 202, 0.2)",
            }}
          >
            {checking ? "Checking..." : "I've been invited — refresh"}
          </button>

          {pollTimedOut && (
            <p style={{ fontSize: "14px", color: "var(--color-warning-text)", margin: 0 }}>
              Still waiting for your organization assignment. Please contact your administrator.
            </p>
          )}

          <button
            onClick={signOut}
            style={{
              width: "100%",
              padding: "14px",
              background: "var(--color-bg-secondary)",
              color: "var(--color-text-muted)",
              border: "none",
              borderRadius: "12px",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 150ms ease",
            }}
          >
            Sign Out
          </button>
        </div>
        
        <div style={{ marginTop: "40px", paddingTop: "24px", borderTop: "1px solid var(--color-bg-secondary)" }}>
          <p style={{ fontSize: "14px", color:"var(--color-text-subtle)" }}>
            Setting up a new facility? <br />
            <a href="mailto:support@dubgrid.com" style={{ color: "var(--color-link)", fontWeight: 600, textDecoration: "none" }}>Contact us</a>
          </p>
        </div>
      </div>
    </div>
  );
}
