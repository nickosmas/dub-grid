import type { PropsWithChildren } from "react";
import { useMobileRealtimeInvalidation } from "../../../shared/hooks/useMobileRealtimeInvalidation";
import { useMobileAccountRealtimeInvalidation } from "../../../shared/hooks/useMobileAccountRealtimeInvalidation";
import { queryClient } from "../../../shared/lib/query-client";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useBootstrap } from "../hooks/useBootstrap";
import { useMobilePermissionsRealtime } from "../hooks/useMobilePermissionsRealtime";
import { useOwnRoleChangeNotice } from "../hooks/useOwnRoleChangeNotice";

export function MobileRealtimeProvider({ children }: PropsWithChildren) {
  const { accessToken, session } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const currentOrg = bootstrapQuery.data?.currentOrg ?? null;
  const userId = session?.user?.id ?? null;

  const permissions = bootstrapQuery.data?.permissions;
  useMobileRealtimeInvalidation({
    accessToken,
    orgId: currentOrg?.id ?? null,
    includeDrafts:
      bootstrapQuery.data?.effectiveRole === "super_admin" ||
      permissions?.canEditShifts === true ||
      permissions?.canEditNotes === true,
    queryClient,
  });

  useMobileAccountRealtimeInvalidation({
    accessToken,
    userId,
    queryClient,
  });

  useMobilePermissionsRealtime({
    accessToken,
    userId,
    queryClient,
  });

  useOwnRoleChangeNotice({
    accessToken,
    userId,
    bootstrap: bootstrapQuery.data,
    queryClient,
  });

  return <>{children}</>;
}
