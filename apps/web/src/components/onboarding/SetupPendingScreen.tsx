"use client";

import { useEffect } from "react";
import { DubGridLogo } from "@/components/Logo";
import { useLogout } from "@/hooks";

/**
 * Shown to authenticated users who can't advance org config — regular users
 * and admins without any manage-* permission — when they log in before the
 * org is fully configured. Blocks access to the app until a user with
 * configuration permissions completes setup.
 */
export default function SetupPendingScreen() {
  const { signOut } = useLogout();

  // Auto-refresh every 30s to check if admin has completed setup
  useEffect(() => {
    const interval = setInterval(() => {
      window.location.reload();
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background:
          "linear-gradient(to bottom, var(--color-bg) 0%, var(--color-brand-bg, #eff6ff) 100%)",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          textAlign: "center",
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: 28, display: "flex", justifyContent: "center" }}>
          <DubGridLogo size={48} />
        </div>

        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: "var(--color-text-primary)",
            margin: "0 0 12px",
            letterSpacing: "-0.02em",
          }}
        >
          Setup in Progress
        </h1>

        <p
          style={{
            fontSize: 15,
            color: "var(--color-text-muted)",
            lineHeight: 1.6,
            margin: "0 0 32px",
            maxWidth: 360,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Your administrator is still configuring the organization. You&apos;ll be able to access
          the app once setup is complete. This page refreshes automatically.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={() => window.location.reload()}
            type="button"
            style={{
              padding: "10px 24px",
              borderRadius: 10,
              border: "none",
              background: "var(--color-brand)",
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "transform 150ms ease",
            }}
          >
            Refresh
          </button>
          <button
            onClick={() => signOut()}
            type="button"
            style={{
              padding: "10px 24px",
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text-primary)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 150ms ease",
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
