"use client";

import { useCallback } from "react";
import Modal from "@/components/Modal";
import { useAuth } from "@/components/AuthProvider";
import { useLogout } from "@/hooks";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { refreshBrowserSession } from "@/features/account/client";

const INACTIVITY_REDIRECT = "/goodbye?reason=inactivity";

/**
 * Signs the user out after 30 minutes of client-side inactivity, showing a
 * warning modal with a 60s grace period first. Self-gates on `user` so it's
 * inert on public routes (login, marketing, accept-invite, etc.).
 */
export default function InactivityGuard() {
  const { user } = useAuth();
  const { signOut } = useLogout();

  const handleExpire = useCallback(() => {
    signOut({ redirectTo: INACTIVITY_REDIRECT });
  }, [signOut]);

  const { phase, secondsRemaining, stayActive } = useIdleTimer({
    enabled: Boolean(user),
    onExpire: handleExpire,
  });

  const handleStay = useCallback(() => {
    stayActive();
    void refreshBrowserSession().catch(() => {
      // Best-effort — the SDK's own autoRefreshToken will retry regardless.
    });
  }, [stayActive]);

  if (!user || phase !== "warning") return null;

  return (
    <Modal title="Still there?" onClose={handleStay} style={{ maxWidth: 400 }}>
      <p
        style={{
          margin: "0 0 20px",
          fontSize: "var(--dg-fs-body-sm)",
          lineHeight: 1.5,
          color: "var(--color-text-secondary)",
        }}
        aria-live="polite"
      >
        You&rsquo;ll be signed out in {secondsRemaining} seconds due to inactivity.
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="dg-btn dg-btn-secondary"
          onClick={handleExpire}
        >
          Sign out now
        </button>
        <button
          type="button"
          className="dg-btn dg-btn-primary"
          onClick={handleStay}
        >
          Stay signed in
        </button>
      </div>
    </Modal>
  );
}
