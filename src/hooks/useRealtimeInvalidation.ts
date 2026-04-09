import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@/lib/sentry";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/query-keys";

/**
 * Table → React Query key mapping for CDC-driven invalidation.
 * Every table listed here must be in the `supabase_realtime` publication
 * (see 001_schema.sql ALTER PUBLICATION block).
 */
const TABLE_KEY_MAP: Record<string, (orgId: string) => readonly unknown[]> = {
  focus_areas: (orgId) => queryKeys.org.focusAreas(orgId),
  shift_codes: (orgId) => queryKeys.org.shiftCodes(orgId),
  absence_types: (orgId) => queryKeys.org.absenceTypes(orgId),
  coverage_requirements: (orgId) => queryKeys.org.coverageRequirements(orgId),
  employees: (orgId) => queryKeys.employees.all(orgId),
  shifts: (orgId) => queryKeys.shifts.all(orgId),
  shift_categories: (orgId) => queryKeys.org.shiftCategories(orgId),
  recurring_shifts: (orgId) => queryKeys.recurringShifts.all(orgId),
  shift_requests: (orgId) => queryKeys.shiftRequests.all(orgId),
  organization_memberships: (orgId) => queryKeys.org.users(orgId),
};

/**
 * Subscribes to Postgres CDC events for org config tables and employees.
 * On any change, the corresponding React Query cache entry is invalidated,
 * triggering a refetch in whichever component owns that query.
 *
 * Call once per mounted app (typically from useOrganizationData).
 */
export function useRealtimeInvalidation(orgId: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orgId) return;

    let hadError = false;

    // Unique suffix per mount to avoid reusing an already-subscribed channel
    // (React strict mode re-mounts effects; supabase.channel(name) returns
    // the existing channel if the name matches).
    const mountId = Math.random().toString(36).slice(2, 8);
    const channel = supabase.channel(`config_cdc:${orgId}:${mountId}`);

    for (const [table, keyFn] of Object.entries(TABLE_KEY_MAP)) {
      channel.on(
        "postgres_changes" as "system",
        {
          event: "*",
          schema: "public",
          table,
          filter: `org_id=eq.${orgId}`,
        } as Record<string, unknown>,
        (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
          // Client-side org_id validation: ignore events that don't match current org
          const row = payload.new ?? payload.old;
          if (row && row.org_id && row.org_id !== orgId) return;
          queryClient.invalidateQueries({ queryKey: keyFn(orgId) });
        },
      );
    }

    channel.subscribe((status: string, err?: Error) => {
      if (status === "SUBSCRIBED" && hadError) {
        hadError = false;
        // Reconnected — invalidate all tracked keys to catch missed events
        for (const keyFn of Object.values(TABLE_KEY_MAP)) {
          queryClient.invalidateQueries({ queryKey: keyFn(orgId) });
        }
      } else if (status === "CHANNEL_ERROR") {
        hadError = true;
        Sentry.captureException(err ?? new Error("config_cdc channel error"));
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);
}
