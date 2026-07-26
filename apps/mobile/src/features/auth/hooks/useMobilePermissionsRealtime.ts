import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { createRealtimeChannelName, subscribeToPostgresChanges } from "@dubgrid/realtime-core";
import { getSupabaseClient } from "../../../shared/lib/supabase";

// Realtime: re-resolve the bootstrap-derived permission cache on membership
// changes. When another session (e.g. super_admin) updates the current
// user's admin_permissions or org_role, a Postgres change event refetches
// bootstrap and re-renders permission-gated UI immediately.
//
// Also subscribes to `employees` for this user: bench/activate flips the
// benched override in the bootstrap permissions payload, and we want the
// open app to drop into / out of read-only the moment an admin presses the
// button, not at next refresh. This intentionally overlaps with the
// broader, debounced org-wide realtime hook (which also invalidates
// bootstrap on employees/organization_memberships changes, org-filtered,
// any event) — this hook is narrower (own-row only, UPDATE only) but faster
// (no debounce, direct refetch). Mirrors web's usePermissions.ts.
export function useMobilePermissionsRealtime({
  accessToken,
  userId,
  disabled = false,
  queryClient,
}: {
  accessToken: string | null;
  userId: string | null;
  disabled?: boolean;
  queryClient: QueryClient;
}) {
  useEffect(() => {
    if (!accessToken || !userId || disabled) return;

    const supabase = getSupabaseClient();
    if (
      !supabase ||
      typeof supabase.channel !== "function" ||
      typeof supabase.removeChannel !== "function"
    ) {
      return;
    }

    const reResolve = () => {
      void queryClient.refetchQueries({
        queryKey: ["mobile", "bootstrap", accessToken],
        type: "active",
      });
    };

    const unsubscribeMembership = subscribeToPostgresChanges(
      supabase,
      createRealtimeChannelName("perms:m"),
      [
        {
          table: "organization_memberships",
          event: "UPDATE",
          filter: `user_id=eq.${userId}`,
          onEvent: reResolve,
        },
      ],
    );

    const unsubscribeEmployee = subscribeToPostgresChanges(
      supabase,
      createRealtimeChannelName("perms:e"),
      [
        {
          table: "employees",
          event: "UPDATE",
          filter: `user_id=eq.${userId}`,
          onEvent: reResolve,
        },
      ],
    );

    return () => {
      unsubscribeMembership();
      unsubscribeEmployee();
    };
  }, [accessToken, disabled, queryClient, userId]);
}
