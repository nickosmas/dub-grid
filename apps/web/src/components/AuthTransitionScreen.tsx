"use client";

import { useEffect, useState } from "react";
import { AnimatedDubGridLogo } from "@/components/AnimatedDubGridLogo";
import { Button } from "@/components/Button";
import { useLogout } from "@/hooks/useLogout";
import { getAuthTransitionStartedAt } from "@/lib/auth-transition";

type TransitionPhase = "signing-in" | "workspace" | "onboarding";

const PHASE_COPY: Record<TransitionPhase, { title: string; detail: string }> = {
  "signing-in": {
    title: "Signing you in",
    detail: "Securing your session and getting things ready.",
  },
  workspace: {
    title: "Loading your organization",
    detail: "Just a moment while we prepare everything you need.",
  },
  onboarding: {
    title: "Preparing your organization",
    detail: "We’re finishing a few things before you begin.",
  },
};

/**
 * Visible, bounded feedback for an authenticated handoff. Unlike AuthSplash,
 * which is intentionally reserved for logout teardown, this is announced to
 * assistive technology and always provides a way out of a prolonged wait.
 */
export default function AuthTransitionScreen({
  phase,
  onRetry,
  retrying = false,
  offline = false,
  showActionsImmediately = false,
}: {
  phase: TransitionPhase;
  onRetry?: () => Promise<void>;
  retrying?: boolean;
  offline?: boolean;
  showActionsImmediately?: boolean;
}) {
  const { signOut } = useLogout();
  const [startedAt] = useState(() => getAuthTransitionStartedAt() ?? Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(() =>
    Math.floor((Date.now() - startedAt) / 1_000),
  );
  const copy = PHASE_COPY[phase];
  const isSlow = elapsedSeconds >= 15;
  const showEscape = showActionsImmediately || elapsedSeconds >= 30;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const detail = offline
    ? "You’re offline. We’ll continue when you’re connected again."
    : isSlow
      ? "This is taking a little longer than usual. We’re still getting things ready."
      : copy.detail;

  return (
    <main
      aria-live="polite"
      aria-busy="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10002,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--dg-color-bg)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <AnimatedDubGridLogo />
        </div>
        <h1
          style={{
            margin: "0 0 12px",
            color: "var(--dg-color-text-primary)",
            fontSize: "var(--dg-fs-page-title)",
            fontWeight: 700,
          }}
        >
          {copy.title}
        </h1>
        <p
          style={{
            maxWidth: 360,
            margin: "0 auto",
            color: "var(--dg-color-text-muted)",
            fontSize: "var(--dg-fs-body)",
            lineHeight: 1.6,
          }}
        >
          {detail}
        </p>
        {showEscape ? (
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 28 }}>
            {onRetry ? (
              <Button
                type="button"
                className="dg-btn dg-btn-primary"
                loading={retrying}
                onClick={onRetry}
              >
                Try again
              </Button>
            ) : null}
            <Button type="button" className="dg-btn dg-btn-secondary" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
