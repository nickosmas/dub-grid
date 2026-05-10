import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
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
    const channelId = `mobile-freshness:${orgId}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const channel = supabase.channel(channelId);
    const handleChange = (table: MobileRealtimeTable) => {
      invalidateMobileRealtimeQueries(queryClient, accessToken, table);
    };

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "organizations",
        filter: `id=eq.${orgId}`,
      },
      () => handleChange("organizations"),
    );

    for (const table of ORG_FILTER_TABLES) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `org_id=eq.${orgId}`,
        },
        () => handleChange(table),
      );
    }

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.warn("Mobile realtime freshness channel error");
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [accessToken, disabled, orgId, queryClient]);
}
