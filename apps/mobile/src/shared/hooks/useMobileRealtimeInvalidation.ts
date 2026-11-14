import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { subscribeOrgScopedRealtime } from "@dubgrid/realtime-core";
import {
  invalidateMobileRealtimeQueriesForTables,
  type MobileRealtimeTable,
} from "../lib/mobile-realtime-invalidation";
import { getUserIdFromAccessToken } from "../lib/access-token";
import { getSupabaseClient } from "../lib/supabase";

const ORG_FILTER_TABLES: MobileRealtimeTable[] = [
  "organizations",
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
  "impersonation_sessions",
];

export function useMobileRealtimeInvalidation({
  accessToken,
  orgId,
  includeDrafts = false,
  queryClient,
}: {
  accessToken: string | null;
  orgId: string | null;
  /**
   * Also follow draft cells, snapshots and notes, which arrive on their own
   * topic that only someone who edits the schedule may join (140). Staff
   * phones no longer refetch on every draft edit (F-150).
   */
  includeDrafts?: boolean;
  queryClient: QueryClient;
}) {
  // Read when an event lands, not a dependency: supabase-js hands each
  // refreshed token to the realtime socket itself, and rejoining the channel
  // on every refresh dropped the events sent while it was down.
  const accessTokenRef = useRef(accessToken);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);
  const userId = getUserIdFromAccessToken(accessToken);
  const hasToken = accessToken !== null;

  // Rejoined for another person or organization, never for a refreshed token.
  useEffect(() => {
    if (!hasToken || !orgId) return;

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
      includeDrafts,
      // Coalesce bursts (a save touches several tables) into one invalidation
      // flush per window, matching web's org-freshness hook.
      debounceMs: 150,
      onFlush: (tables) => {
        const token = accessTokenRef.current;
        if (!token) return;
        // Several tables feed the same families (a cell save touches three),
        // so each family is invalidated once, keeping a fetch in flight.
        invalidateMobileRealtimeQueriesForTables(queryClient, token, tables);
      },
      // Events missed while the channel was down could be on any table it
      // watches, so the catch-up refreshes every family those tables feed
      // (bootstrap included, through the organizations row).
      onReconnectAfterError: () => {
        const token = accessTokenRef.current;
        if (!token) return;
        invalidateMobileRealtimeQueriesForTables(queryClient, token, ORG_FILTER_TABLES);
      },
      onError: (error) => {
        console.error("Mobile realtime freshness channel error", error);
      },
    });
  }, [hasToken, includeDrafts, orgId, queryClient, userId]);
}
