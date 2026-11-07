"use client";

import { useCallback, useId, useMemo } from "react";
import Modal from "@/components/Modal";
import { Timer } from "lucide-react";
import { Button } from "@/components/Button";
import { useAuth } from "@/components/AuthProvider";
import { useLogout } from "@/hooks";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { refreshBrowserSession } from "@/features/account/client";
import { readSupabaseSessionId } from "@/features/account/client/session-registration";

const INACTIVITY_REDIRECT = "/goodbye?reason=inactivity";
const FINAL_ANNOUNCEMENT_SECONDS = 10;

/**
 * Signs the user out after 30 minutes of client-side inactivity, showing a
 * warning modal with a 60s grace period first. Self-gates on `user` so it's
 * inert on public routes (login, marketing, accept-invite, etc.). Only Stay
 * signed in or Escape ends the warning; moving the mouse doesn't.
 */
export default function InactivityGuard() {
  const { user, session } = useAuth();
  const { signOut } = useLogout();
  const descriptionId = useId();
  const accessToken = session?.access_token;
  const sessionKey = useMemo(
    () => (accessToken ? readSupabaseSessionId(accessToken) : null),
    [accessToken],
  );

  const handleExpire = useCallback(() => {
    signOut({ redirectTo: INACTIVITY_REDIRECT });
  }, [signOut]);

  const { phase, secondsRemaining, stayActive } = useIdleTimer({
    enabled: Boolean(user),
    sessionKey,
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
    <Modal
      alert={{ icon: Timer }}
      title="Still there?"
      onClose={handleStay}
      aria-describedby={descriptionId}
      footer={
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <Button type="button" className="dg-btn dg-btn-secondary" onClick={handleExpire}>
            Sign out now
          </Button>
          <Button type="button" className="dg-btn dg-btn-primary" onClick={handleStay}>
            Stay signed in
          </Button>
        </div>
      }
    >
      {/* The dialog reads this once as it opens; the number ticking every
          second stays silent until the last few seconds. */}
      <p
        id={descriptionId}
        style={{
          margin: 0,
          fontSize: "var(--dg-fs-body-sm)",
          lineHeight: 1.5,
          color: "var(--dg-color-text-secondary)",
        }}
      >
        You&rsquo;ll be signed out in {secondsRemaining} seconds due to inactivity.
      </p>
      <span className="sr-only" aria-live="polite">
        {secondsRemaining <= FINAL_ANNOUNCEMENT_SECONDS
          ? `You'll be signed out in ${FINAL_ANNOUNCEMENT_SECONDS} seconds.`
          : ""}
      </span>
    </Modal>
  );
}
