import type { PropsWithChildren } from "react";
import { useMobileRealtimeInvalidation } from "../../../shared/hooks/useMobileRealtimeInvalidation";
import { useMobileAccountRealtimeInvalidation } from "../../../shared/hooks/useMobileAccountRealtimeInvalidation";
import { queryClient } from "../../../shared/lib/query-client";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useBootstrap } from "../hooks/useBootstrap";

export function MobileRealtimeProvider({ children }: PropsWithChildren) {
  const { accessToken, session } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const currentOrg = bootstrapQuery.data?.currentOrg ?? null;
  const disabled = currentOrg?.featureFlags.disable_realtime === true;

  useMobileRealtimeInvalidation({
    accessToken,
    orgId: currentOrg?.id ?? null,
    disabled,
    queryClient,
  });

  useMobileAccountRealtimeInvalidation({
    accessToken,
    userId: session?.user?.id ?? null,
    disabled,
    queryClient,
  });

  return <>{children}</>;
}
