import type { PropsWithChildren } from "react";
import { useMobileRealtimeInvalidation } from "../../../shared/hooks/useMobileRealtimeInvalidation";
import { useMobileAccountRealtimeInvalidation } from "../../../shared/hooks/useMobileAccountRealtimeInvalidation";
import { queryClient } from "../../../shared/lib/query-client";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useBootstrap } from "../hooks/useBootstrap";
import { useMobilePermissionsRealtime } from "../hooks/useMobilePermissionsRealtime";

export function MobileRealtimeProvider({ children }: PropsWithChildren) {
  const { accessToken, session } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const currentOrg = bootstrapQuery.data?.currentOrg ?? null;
  const disabled = currentOrg?.featureFlags.disable_realtime === true;
  const userId = session?.user?.id ?? null;

  useMobileRealtimeInvalidation({
    accessToken,
    orgId: currentOrg?.id ?? null,
    disabled,
    queryClient,
  });

  useMobileAccountRealtimeInvalidation({
    accessToken,
    userId,
    disabled,
    queryClient,
  });

  useMobilePermissionsRealtime({
    accessToken,
    userId,
    disabled,
    queryClient,
  });

  return <>{children}</>;
}
