"use client";

import { useEffect, useState } from "react";
import { LoaderIcon } from "lucide-react";
import { Button } from "@/components/Button";
import { useLogout } from "@/hooks/useLogout";
import { getAuthTransitionStartedAt } from "@/lib/auth-transition";

type TransitionPhase = "signing-in" | "organization" | "onboarding";

const PHASE_COPY: Record<TransitionPhase, { title: string; detail: string }> = {
  "signing-in": {
    title: "Signing you in",
    detail: "We’re securely starting your session.",
  },
  organization: {
    title: "Preparing your Organization",
    detail: "We’re loading the information you need to get started.",
  },
  onboarding: {
    title: "Loading your setup",
    detail: "We’re checking what needs to happen next.",
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
}: {
  phase: TransitionPhase;
  onRetry?: () => Promise<void>;
  retrying?: boolean;
  offline?: boolean;
}) {
  const { signOut } = useLogout();
  const [startedAt] = useState(() => getAuthTransitionStartedAt() ?? Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(() =>
    Math.floor((Date.now() - startedAt) / 1_000),
  );
  const copy = PHASE_COPY[phase];
  const isSlow = elapsedSeconds >= 15;
  const showEscape = elapsedSeconds >= 30;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const detail = offline
    ? "You appear to be offline. We’ll continue when your connection returns."
    : isSlow
      ? "This is taking longer than usual. We’re still working in the background."
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
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <LoaderIcon
            aria-hidden="true"
            className="animate-spin"
            size={32}
            style={{ color: "var(--dg-color-brand)" }}
          />
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
