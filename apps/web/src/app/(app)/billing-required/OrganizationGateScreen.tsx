"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { settleWithRequestTimeout } from "@/lib/fetch-with-timeout";
import { queryKeys } from "@/lib/query-keys";

export const ORGANIZATION_GATE_RECHECK_INTERVAL_MS = 5_000;

const ORGANIZATION_GATE_MANUAL_DEADLINE_MS = 15_000;

export function getGateMessage(state: OrganizationAccessState | undefined): string {
  switch (state) {
    case "unavailable":
      return "This organization is currently unavailable. Please try again later.";
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

/**
 * The screen a user lands on when the organization gate in the proxy holds
 * them out: the trial clock has not started, or billing has lapsed.
 *
 * The gate lives in the proxy, so once the organization opens, a client
 * navigation through it immediately admits the same session. This page polls
 * for that change and keeps a manual check and a way out for anyone who would
 * rather not wait.
 */
export function OrganizationGateScreen() {
  const router = useRouter();
  const { signOut } = useLogout();
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [checking, setChecking] = useState(false);
  const recheckInFlight = useRef<Promise<void> | null>(null);
  const admitted = useRef(false);

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
    refetchInterval: online ? ORGANIZATION_GATE_RECHECK_INTERVAL_MS : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    gcTime: 0,
  });
  const refetchStatus = status.refetch;

  const available = status.data?.available === true;

  const admit = useCallback(() => {
    if (admitted.current) return;
    admitted.current = true;
    router.replace("/schedule");
  }, [router]);

  useEffect(() => {
    if (!available) return;
    admit();
  }, [admit, available]);

  const recheck = useCallback(() => {
    if (recheckInFlight.current) return recheckInFlight.current;
    setChecking(true);
    const current = settleWithRequestTimeout(
      refetchStatus({ cancelRefetch: false }),
      ORGANIZATION_GATE_MANUAL_DEADLINE_MS,
    )
      .then((result) => {
        if (result.data?.available) admit();
      })
      .catch(() => undefined)
      .finally(() => {
        if (recheckInFlight.current === current) recheckInFlight.current = null;
        setChecking(false);
      });
    recheckInFlight.current = current;
    return current;
  }, [admit, refetchStatus]);

  useEffect(() => {
    const markOffline = () => setOnline(false);
    const markOnline = () => {
      setOnline(true);
      void recheck();
    };
    window.addEventListener("offline", markOffline);
    window.addEventListener("online", markOnline);
    return () => {
      window.removeEventListener("offline", markOffline);
      window.removeEventListener("online", markOnline);
    };
  }, [recheck]);

  async function checkAgain() {
    await recheck();
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
              <ButtonLoading loading={checking || status.isFetching}>Check again</ButtonLoading>
            </Button>
          </div>
        </AuthStateCard>
      </Card>
    </PageShell>
  );
}
