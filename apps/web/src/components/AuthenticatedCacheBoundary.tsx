"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import AuthTransitionScreen from "@/components/AuthTransitionScreen";
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

// The screens that establish a session. Changing identity is what they are for,
// and they show no organization data, so they stay mounted across the change:
// withholding them unmounted the form mid-sign-in (it came back empty and the
// flow that owned the navigation was gone), and a changed organization claim
// hard-reloaded the page under the person signing in.
const SESSION_ENTRY_ROUTES = ["/login", "/accept-invite", "/reset-password", "/auth"];

function isSessionEntryRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return SESSION_ENTRY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

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
  const onSessionEntryRoute = isSessionEntryRoute(usePathname());
  const identity = useMemo(() => getWebAuthIdentity(session), [session]);
  const [settledIdentity, setSettledIdentity] = useState<WebAuthIdentity>(identity);
  const transitionGenerationRef = useRef(0);
  const latestIdentityRef = useRef(identity);
  latestIdentityRef.current = identity;

  const crossesDataBoundary = crossesWebAuthDataBoundary(settledIdentity, identity);
  const blocksNewIdentity =
    !onSessionEntryRoute &&
    (identity.kind === "unreadable" ||
      (crossesDataBoundary &&
        identity.kind !== "anonymous" &&
        !isSameWebAuthIdentity(settledIdentity, identity)));

  useEffect(() => {
    if (isSameWebAuthIdentity(settledIdentity, identity)) return;

    const generation = ++transitionGenerationRef.current;
    // The tab that initiated a switch owns its destination. Other tabs have no
    // sessionStorage handoff marker, so a received organization claim still
    // hard-reloads them across the same cache boundary.
    const shouldReload =
      changesWebAuthOrganization(settledIdentity, identity) &&
      !isAuthTransitionPending() &&
      !onSessionEntryRoute;

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
  }, [crossesDataBoundary, identity, onSessionEntryRoute, queryClient, settledIdentity]);

  useEffect(
    () => () => {
      transitionGenerationRef.current += 1;
    },
    [],
  );

  if (!blocksNewIdentity) return children;
  // A sign-in that reaches the app before the previous identity's data is gone
  // waits here; say so rather than showing a blank page.
  return isAuthTransitionPending() ? <AuthTransitionScreen phase="signing-in" /> : null;
}
