import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { subscribeOrgScopedRealtime } from "@dubgrid/realtime-core";
import {
  invalidateMobileRealtimeQueries,
  type MobileRealtimeTable,
} from "../lib/mobile-realtime-invalidation";
import { getSupabaseClient } from "../lib/supabase";

const ORG_FILTER_TABLES: MobileRealtimeTable[] = [
  "focus_areas",
  "shift_categories",
  "jobs",
  "absence_types",
  "coverage_requirements",
  "departments",
  "certifications",
  "organization_roles",
  "organization_memberships",
  "subscriptions",
  "invitations",
  "indicator_types",
  "employees",
  "shift_requests",
  "schedule_cells",
  "schedule_cell_snapshots",
  "schedule_cell_segments",
  "schedule_notes",
  "profile_change_requests",
  "recurring_shifts",
  "publish_history",
  "audit_log",
  "impersonation_sessions",
];

export function useMobileRealtimeInvalidation({
  accessToken,
  orgId,
  disabled = false,
  queryClient,
}: {
  accessToken: string | null;
  orgId: string | null;
  disabled?: boolean;
  queryClient: QueryClient;
}) {
  useEffect(() => {
    if (!accessToken || !orgId || disabled) return;

    const supabase = getSupabaseClient();
    if (
      !supabase ||
      typeof supabase.channel !== "function" ||
      typeof supabase.removeChannel !== "function"
    ) {
      return;
    }

    return subscribeOrgScopedRealtime<MobileRealtimeTable>({
      client: supabase,
      orgId,
      tables: ORG_FILTER_TABLES,
      rowScopedTable: "organizations",
      // Coalesce bursts of postgres_changes events (e.g. a bulk save) into
      // one invalidation flush per window, matching web's org-freshness hook.
      debounceMs: 150,
      channelNamePrefix: `mobile-freshness:${orgId}`,
      onFlush: (tables) => {
        for (const table of tables) {
          invalidateMobileRealtimeQueries(queryClient, accessToken, table);
        }
      },
      onReconnectAfterError: () => {
        void queryClient.invalidateQueries({
          queryKey: ["mobile", "bootstrap", accessToken],
        });
      },
      onError: (error) => {
        console.error("Mobile realtime freshness channel error", error);
      },
    });
  }, [accessToken, disabled, orgId, queryClient]);
}
