import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { subscribeToTableChanges, userTopic } from "@dubgrid/realtime-core";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { BOOTSTRAP_QUERY_KEY_PREFIX } from "./useBootstrap";

// Realtime: re-resolve the bootstrap-derived permission cache on membership
// changes. When another session (e.g. super_admin) updates the current
// user's admin_permissions or org_role, a change on their own topic refetches
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
  queryClient,
}: {
  accessToken: string | null;
  userId: string | null;
  queryClient: QueryClient;
}) {
  // Only whether there is a token: a refreshed one reaches the realtime
  // socket through supabase-js, and rejoining on each refresh lost events.
  const hasToken = accessToken !== null;

  useEffect(() => {
    if (!hasToken || !userId) return;

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
        // Prefix match: the entry is keyed by user id, which this hook has no
        // reason to restate. Only one account is signed in at a time anyway.
        queryKey: BOOTSTRAP_QUERY_KEY_PREFIX,
        type: "active",
      });
    };

    // The person's own topic. A membership update that only stamped when
    // they opened Schedule never reaches it (140).
    return subscribeToTableChanges(supabase, [
      {
        table: "organization_memberships",
        topic: userTopic(userId),
        event: "UPDATE",
        onEvent: reResolve,
      },
      { table: "employees", topic: userTopic(userId), event: "UPDATE", onEvent: reResolve },
    ]);
  }, [hasToken, queryClient, userId]);
}
