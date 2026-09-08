"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { AuthStateCard } from "@/components/auth/AuthStateCard";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import {
  fetchOrganizationAccessStatus,
  type OrganizationAccessState,
} from "@/features/organization/client/api";
import { useLogout } from "@/hooks";
import { consumeAuthTransition } from "@/lib/auth-transition";
import { queryKeys } from "@/lib/query-keys";

const RECHECK_INTERVAL_MS = 20_000;

// The proxy accepts an org-access answer up to TTL.MIDDLEWARE (30s) old plus a
// 10s per-instance memo, so it can still be holding the gate for a moment after
// this page has been told the organization is open. Waiting longer than that
// window between automatic reloads keeps a stale gate to one extra reload
// instead of a loop.
const RELOAD_COOLDOWN_MS = 45_000;
const RELOAD_MARKER_KEY = "dg-org-gate-reloaded-at";

export function getGateMessage(state: OrganizationAccessState | undefined): string {
  switch (state) {
    case "locked":
      return "This organization is on hold until an administrator sorts out its billing.";
    case "suspended":
      return "This organization was suspended by DubGrid staff. Your administrator can tell you more.";
    case "archived":
      return "This organization is no longer available. Sign out to use a different account.";
    default:
      return "Your organization opens up once your administrator finishes setup.";
  }
}

/** True when an automatic reload has not been spent inside the cooldown. */
export function claimAutomaticReload(now: number = Date.now()): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_MARKER_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOAD_MARKER_KEY, String(now));
  } catch {
    // Private mode or blocked storage. Losing the cooldown is better than
    // losing the reload the user is waiting on.
  }
  return true;
}

/**
 * The screen a user lands on when the organization gate in the proxy holds
 * them out: the trial clock has not started, or billing has lapsed.
 *
 * Reloading is what clears it. The gate lives in the proxy, so once the
 * organization opens the next request through it redirects to the app on its
 * own; this page only has to notice and reload. It polls for that, and keeps a
 * manual check and a way out for anyone who would rather not wait.
 */
export function OrganizationGateScreen() {
  const { signOut } = useLogout();

  // This page is where a held-out member's sign-in actually ends, and nothing
  // else on the route clears the handoff flag: the onboarding gate passes
  // straight through here and there is no ProtectedRoute above it. Left set,
  // the flag has later screens bridging a login that finished long ago.
  useEffect(() => {
    consumeAuthTransition();
  }, []);

  const status = useQuery({
    queryKey: queryKeys.org.accessStatus(),
    queryFn: ({ signal }) => fetchOrganizationAccessStatus(signal),
    refetchInterval: RECHECK_INTERVAL_MS,
    retry: false,
    gcTime: 0,
  });

  const available = status.data?.available === true;

  useEffect(() => {
    if (!available) return;
    if (!claimAutomaticReload()) return;
    window.location.reload();
  }, [available]);

  async function checkAgain() {
    const result = await status.refetch();
    // A check the user asked for skips the cooldown: they are watching, and a
    // reload that lands back here is a clearer answer than a silent no-op. Mark
    // the reload first so the query update cannot make the availability effect
    // issue a second reload before navigation completes.
    if (result.data?.available) {
      claimAutomaticReload();
      window.location.reload();
    }
  }

  return (
    <PageShell>
      <Card>
        {/* Inside the card, not on the shell gradient above it: the gradient
            runs deep navy to near-white, and where a fixed-color mark lands on
            it moves with the viewport height. Every other auth page keeps the
            logo on the card surface for the same reason. */}
        <div className="dg-auth-logo-block dg-auth-logo-block--spacious">
          <DubGridLogo size={72} />
          <DubGridWordmark />
        </div>

        <AuthStateCard
          heading="Organization unavailable"
          message={getGateMessage(status.data?.state)}
        >
          <div className="dg-auth-gate-actions">
            <Button
              className="dg-btn dg-btn-secondary dg-btn-lg dg-auth-state-primary"
              onClick={() => signOut()}
              type="button"
            >
              Sign out
            </Button>
            <Button
              className="dg-btn dg-btn-primary dg-btn-lg dg-auth-state-primary"
              onClick={checkAgain}
              type="button"
            >
              <ButtonLoading loading={status.isFetching}>Check again</ButtonLoading>
            </Button>
          </div>
        </AuthStateCard>
      </Card>
    </PageShell>
  );
}
