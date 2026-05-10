import type { PropsWithChildren } from "react";
import { useMobileRealtimeInvalidation } from "../../../shared/hooks/useMobileRealtimeInvalidation";
import { queryClient } from "../../../shared/lib/query-client";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useBootstrap } from "../hooks/useBootstrap";

export function MobileRealtimeProvider({ children }: PropsWithChildren) {
  const { accessToken } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const currentOrg = bootstrapQuery.data?.currentOrg ?? null;

  useMobileRealtimeInvalidation({
    accessToken,
    orgId: currentOrg?.id ?? null,
    disabled: currentOrg?.featureFlags.disable_realtime === true,
    queryClient,
  });

  return <>{children}</>;
}
