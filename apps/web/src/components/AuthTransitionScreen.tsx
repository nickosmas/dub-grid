"use client";

import { useEffect, useState } from "react";
import { STARTUP_STATUS_DELAY_MS, STARTUP_TIMEOUT_MS } from "@dubgrid/design-tokens";
import { Button } from "@/components/Button";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { useLogout } from "@/hooks/useLogout";
import { getAuthTransitionStartedAt } from "@/lib/auth-transition";

const STATUS_DELAY_SECONDS = STARTUP_STATUS_DELAY_MS / 1_000;
const TIMEOUT_SECONDS = STARTUP_TIMEOUT_MS / 1_000;

type TransitionPhase = "signing-in" | "workspace" | "onboarding";

const PHASE_COPY: Record<TransitionPhase, { title: string; detail: string }> = {
  "signing-in": {
    title: "Signing you in",
    detail: "Securing your session and getting things ready.",
  },
  workspace: {
    title: "Loading your workspace",
    detail: "Just a moment while we prepare everything you need.",
  },
  onboarding: {
    title: "Preparing your workspace",
    detail: "We’re finishing a few things before you begin.",
  },
};

/**
 * Visible, bounded feedback for an authenticated handoff. Unlike AuthSplash,
 * which is intentionally reserved for logout teardown, this is announced to
 * assistive technology and always provides a way out of a prolonged wait.
 *
 * The mark here is the static brand logo and never animates. What says the app
 * is working is the indeterminate progress bar beneath it, the status copy once
 * the wait passes `STARTUP_STATUS_DELAY_MS`, and the escape actions once it
 * passes `STARTUP_TIMEOUT_MS`. Both thresholds are shared with the mobile
 * splash so one launch does not go quiet for a different length of time
 * depending on the platform.
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
  const [elapsedSeconds, setElapsedSeconds] = useState(() => (Date.now() - startedAt) / 1_000);
  const copy = PHASE_COPY[phase];
  const isSlow = elapsedSeconds >= STATUS_DELAY_SECONDS;
  const showEscape = showActionsImmediately || elapsedSeconds >= TIMEOUT_SECONDS;

  // Ticks faster than once a second because the thresholds are no longer whole
  // seconds: at a 1s tick, a 2.5s threshold would not be met until 3s.
  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedSeconds((Date.now() - startedAt) / 1_000);
    }, 250);
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <DubGridLogo size={56} color="var(--dg-color-brand)" />
          <DubGridWordmark color="var(--dg-color-text-primary)" fontSize={22} />
          <div
            aria-label="Loading"
            className="dg-startup-progress"
            data-startup-progress
            role="progressbar"
          >
            <div className="dg-startup-progress-bar" />
          </div>
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
