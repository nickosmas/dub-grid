import { useEffect, useRef, useState, type ReactNode } from "react";
import { router, usePathname } from "expo-router";
import { useBootstrap } from "../hooks/useBootstrap";
import { OrganizationLockedScreen } from "../screens/OrganizationLockedScreen";
import { handleExpiredMobileSession } from "../../../shared/lib/auth-reset";
import { getOrgUnavailableMessage } from "../../../shared/lib/errors";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";

/**
 * The session and organization gate for routes mounted outside the tab
 * navigator (alerts, shift and person detail), which a notification deep
 * link can open cold. Without it a signed-out link sat on a loading state
 * forever; now it goes through login and comes back to the same path.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { accessToken, isLoading } = useSessionState();
  const pathname = usePathname();
  // Captured on mount: the screen stays mounted while the redirect animates,
  // and by then the live pathname already reads `/login`.
  const [destination] = useState(pathname);
  const redirectedRef = useRef(false);
  const bootstrapQuery = useBootstrap(accessToken);
  const lockedMessage = getOrgUnavailableMessage(bootstrapQuery.error);
  const shouldRedirect = !isLoading && !accessToken;

  useEffect(() => {
    if (!shouldRedirect || redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace({ pathname: "/(auth)/login", params: { next: destination } });
  }, [destination, shouldRedirect]);

  // The startup splash still covers the screen while the session restores.
  if (isLoading || shouldRedirect) return null;

  if (lockedMessage) {
    return (
      <OrganizationLockedScreen
        accessToken={accessToken}
        isRetrying={bootstrapQuery.isFetching}
        message={lockedMessage}
        onRetry={() => {
          void bootstrapQuery.refetch();
        }}
        onSignOut={() => {
          void handleExpiredMobileSession();
        }}
      />
    );
  }

  return <>{children}</>;
}
