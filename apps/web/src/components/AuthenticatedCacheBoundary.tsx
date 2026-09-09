"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import {
  getBrowserRealtimeChannels,
  removeBrowserRealtimeChannel,
} from "@/features/account/client";
import {
  changesWebAuthOrganization,
  crossesWebAuthDataBoundary,
  getWebAuthIdentity,
  isSameWebAuthIdentity,
  type WebAuthIdentity,
} from "@/features/account/client/session-identity";
import { reloadForWebAuthOrganizationChange } from "@/lib/auth-boundary-navigation";
import { isAuthTransitionPending } from "@/lib/auth-transition";

async function clearAuthenticatedBrowserState(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.cancelQueries();

  const channels = getBrowserRealtimeChannels();
  await Promise.allSettled(channels.map((channel) => removeBrowserRealtimeChannel(channel)));

  queryClient.clear();
}

/**
 * Keeps rotating credentials out of cache identity while making a real user or
 * organization boundary atomic. A changed authenticated identity is withheld
 * until old requests, realtime channels, and queries are gone. Sign-out stays
 * renderable so ProtectedRoute remains the owner of the immediate login exit.
 */
export default function AuthenticatedCacheBoundary({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const identity = useMemo(() => getWebAuthIdentity(session), [session]);
  const [settledIdentity, setSettledIdentity] = useState<WebAuthIdentity>(identity);
  const transitionGenerationRef = useRef(0);
  const latestIdentityRef = useRef(identity);
  latestIdentityRef.current = identity;

  const crossesDataBoundary = crossesWebAuthDataBoundary(settledIdentity, identity);
  const blocksNewIdentity =
    identity.kind === "unreadable" ||
    (crossesDataBoundary &&
      identity.kind !== "anonymous" &&
      !isSameWebAuthIdentity(settledIdentity, identity));

  useEffect(() => {
    if (isSameWebAuthIdentity(settledIdentity, identity)) return;

    const generation = ++transitionGenerationRef.current;
    // The tab that initiated a switch owns its destination. Other tabs have no
    // sessionStorage handoff marker, so a received organization claim still
    // hard-reloads them across the same cache boundary.
    const shouldReload =
      changesWebAuthOrganization(settledIdentity, identity) && !isAuthTransitionPending();

    if (!crossesDataBoundary) {
      setSettledIdentity(identity);
      return;
    }

    void clearAuthenticatedBrowserState(queryClient).then(() => {
      if (
        transitionGenerationRef.current !== generation ||
        !isSameWebAuthIdentity(latestIdentityRef.current, identity)
      ) {
        return;
      }
      if (shouldReload) {
        reloadForWebAuthOrganizationChange();
        return;
      }
      setSettledIdentity(identity);
    });
  }, [crossesDataBoundary, identity, queryClient, settledIdentity]);

  useEffect(
    () => () => {
      transitionGenerationRef.current += 1;
    },
    [],
  );

  return blocksNewIdentity ? null : children;
}
