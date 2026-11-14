"use client";

import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
  PLATFORM_TOPIC,
  createDebouncedTableFlusher,
  subscribeToTableChanges,
  type RealtimeChangePayload,
} from "@dubgrid/realtime-core";
import * as Sentry from "@/lib/sentry";
import { broadcastInvalidation } from "@/lib/cache-broadcast";
import { queryKeys } from "@/lib/query-keys";
import { uniqueKeys } from "@/lib/realtime-invalidation";
import { getBrowserSupabaseClient } from "@/features/account/client";

export type GridmasterRealtimeTable =
  | "organizations"
  | "subscriptions"
  | "audit_log"
  | "role_change_log"
  | "impersonation_sessions"
  | "focus_areas"
  | "jobs"
  | "absence_types"
  | "coverage_requirements"
  | "departments"
  | "shift_categories"
  | "certifications"
  | "organization_roles"
  | "indicator_types"
  | "employees"
  | "organization_memberships"
  | "invitations"
  | "shift_requests"
  | "schedule_cells"
  | "schedule_cell_snapshots"
  | "schedule_cell_segments"
  | "schedule_notes"
  | "user_sessions"
  | "profiles";

type RealtimePayload = RealtimeChangePayload;

/** Matches the per-organization hook's window. */
const GRIDMASTER_COALESCE_MS = 150;

const ORG_FILTER_TABLES: GridmasterRealtimeTable[] = [
  "subscriptions",
  "focus_areas",
  "jobs",
  "absence_types",
  "coverage_requirements",
  "departments",
  "shift_categories",
  "certifications",
  "organization_roles",
  "indicator_types",
  "employees",
  "organization_memberships",
  "invitations",
  "shift_requests",
  "schedule_cells",
  "schedule_cell_snapshots",
  "schedule_cell_segments",
  "schedule_notes",
  "role_change_log",
  "user_sessions",
  "profiles",
];

export function getGridmasterRealtimeInvalidationKeys(
  table: GridmasterRealtimeTable,
  orgId: string | null = null,
  userId: string | null = null,
): readonly unknown[][] {
  const platformSummaryKeys = [
    queryKeys.gridmaster.dashboard(),
    queryKeys.gridmaster.overview(),
    queryKeys.gridmaster.orgHealth(null),
  ] as const;
  const orgKeys =
    orgId === null
      ? []
      : [
          queryKeys.gridmaster.org(orgId),
          queryKeys.gridmaster.orgHealth(orgId),
          queryKeys.gridmaster.orgAudit(orgId, 0, 50),
        ];

  switch (table) {
    case "organizations":
      return uniqueKeys([
        ...platformSummaryKeys,
        queryKeys.gridmaster.billing(),
        queryKeys.gridmaster.compliance(),
        ...(orgId ? orgKeys : []),
      ]);
    case "subscriptions":
      return uniqueKeys([
        queryKeys.gridmaster.billing(),
        queryKeys.gridmaster.overview(),
        queryKeys.gridmaster.dashboard(),
        queryKeys.gridmaster.orgHealth(null),
        ...(orgId ? [queryKeys.gridmaster.orgHealth(orgId)] : []),
      ]);
    case "audit_log":
      return uniqueKeys([
        queryKeys.gridmaster.auditAll(),
        queryKeys.gridmaster.overview(),
        queryKeys.gridmaster.security(),
        queryKeys.gridmaster.compliance(),
        queryKeys.gridmaster.dashboard(),
        ...(orgId ? [queryKeys.gridmaster.orgAudit(orgId, 0, 50)] : []),
      ]);
    case "role_change_log":
      return uniqueKeys([
        queryKeys.gridmaster.auditAll(),
        queryKeys.gridmaster.overview(),
        queryKeys.gridmaster.security(),
        queryKeys.gridmaster.compliance(),
        queryKeys.gridmaster.dashboard(),
        ...(orgId ? [queryKeys.gridmaster.orgAudit(orgId, 0, 50)] : []),
      ]);
    case "impersonation_sessions":
      return uniqueKeys([
        queryKeys.gridmaster.impersonation(),
        queryKeys.gridmaster.security(),
        queryKeys.gridmaster.overview(),
        queryKeys.gridmaster.compliance(),
        queryKeys.gridmaster.auditAll(),
        ...(orgId ? [queryKeys.gridmaster.orgAudit(orgId, 0, 50)] : []),
      ]);
    // The person pages show sessions, profiles, staff records and invitations
    // (F-81). A change that names its person refreshes that page only; one
    // that does not (an unlinked staff record, an invitation) refreshes every
    // open person page, which are few.
    case "user_sessions":
      return uniqueKeys([
        queryKeys.gridmaster.security(),
        queryKeys.gridmaster.compliance(),
        personPageKey(userId),
      ]);
    case "profiles":
      return uniqueKeys([
        queryKeys.gridmaster.accounts(),
        queryKeys.gridmaster.allUsers(),
        ...platformSummaryKeys,
        personPageKey(userId),
      ]);
    case "employees":
      return uniqueKeys([
        ...platformSummaryKeys,
        personPageKey(userId),
        ...(orgId
          ? [
              queryKeys.gridmaster.org(orgId),
              queryKeys.gridmaster.orgEmployees(orgId),
              queryKeys.gridmaster.orgHealth(orgId),
            ]
          : []),
      ]);
    case "organization_memberships":
      return uniqueKeys([
        queryKeys.gridmaster.allUsers(),
        ...platformSummaryKeys,
        ...(orgId
          ? [queryKeys.gridmaster.orgUsers(orgId), queryKeys.gridmaster.orgHealth(orgId)]
          : []),
        ...(userId ? [queryKeys.gridmaster.person("user", userId)] : []),
      ]);
    case "invitations":
      return uniqueKeys([
        ...platformSummaryKeys,
        queryKeys.gridmaster.auditAll(),
        queryKeys.gridmaster.personAll(),
        ...(orgId
          ? [
              queryKeys.gridmaster.orgInvitations(orgId),
              queryKeys.gridmaster.orgHealth(orgId),
              queryKeys.gridmaster.orgAudit(orgId, 0, 50),
            ]
          : []),
      ]);
    case "shift_requests":
      return uniqueKeys([
        queryKeys.gridmaster.overview(),
        queryKeys.gridmaster.orgHealth(null),
        ...(orgId ? [queryKeys.gridmaster.org(orgId), queryKeys.gridmaster.orgHealth(orgId)] : []),
      ]);
    case "schedule_cells":
    case "schedule_cell_snapshots":
    case "schedule_cell_segments":
    case "schedule_notes":
      return uniqueKeys([
        queryKeys.gridmaster.overview(),
        queryKeys.gridmaster.orgHealth(null),
        queryKeys.gridmaster.dashboard(),
        ...(orgId
          ? [
              queryKeys.gridmaster.org(orgId),
              queryKeys.gridmaster.orgHealth(orgId),
              queryKeys.gridmaster.orgScheduleAll(orgId),
            ]
          : []),
      ]);
    case "focus_areas":
    case "jobs":
    case "absence_types":
    case "coverage_requirements":
    case "departments":
    case "shift_categories":
    case "certifications":
    case "organization_roles":
    case "indicator_types":
      return uniqueKeys([
        queryKeys.gridmaster.overview(),
        queryKeys.gridmaster.orgHealth(null),
        ...(orgId
          ? [
              queryKeys.gridmaster.org(orgId),
              queryKeys.gridmaster.orgConfig(orgId),
              queryKeys.gridmaster.orgHealth(orgId),
            ]
          : []),
      ]);
  }
}

/** The organizations a platform change touched, or one null when none. */
export function resolveGridmasterRealtimeOrgIds(payload: RealtimePayload): (string | null)[] {
  return payload.orgIds && payload.orgIds.length > 0 ? [...payload.orgIds] : [null];
}

function personPageKey(userId: string | null | undefined) {
  return userId ? queryKeys.gridmaster.person("user", userId) : queryKeys.gridmaster.personAll();
}

/** The people whose pages a platform change touched, for the tables that
 * have one (`queryKeys.gridmaster.person("user", userId)`), or one null. */
export function resolveGridmasterRealtimeUserIds(
  table: GridmasterRealtimeTable,
  payload: RealtimePayload,
): (string | null)[] {
  const hasPersonPage =
    table === "profiles" ||
    table === "organization_memberships" ||
    table === "user_sessions" ||
    table === "employees";
  return hasPersonPage && payload.userIds && payload.userIds.length > 0
    ? [...payload.userIds]
    : [null];
}

/**
 * Batches invalidations by query key: changes arrive in bursts across
 * organizations, and many tables share keys (`overview`, `orgHealth`), so
 * each distinct key refetches and broadcasts once per burst. Keys are plain
 * strings and numbers, so they round-trip through JSON unchanged.
 */
export function createGridmasterInvalidationBatcher(
  queryClient: QueryClient,
  delayMs = GRIDMASTER_COALESCE_MS,
) {
  const flusher = createDebouncedTableFlusher<string>(delayMs, (serializedKeys) => {
    for (const serialized of serializedKeys) {
      const queryKey = JSON.parse(serialized) as unknown[];
      void queryClient.invalidateQueries({ queryKey });
      broadcastInvalidation(queryKey);
    }
  });
  return {
    markChanged(table: GridmasterRealtimeTable, orgId: string | null, userId: string | null) {
      for (const queryKey of getGridmasterRealtimeInvalidationKeys(table, orgId, userId)) {
        flusher.markChanged(JSON.stringify(queryKey));
      }
    },
    dispose: () => flusher.dispose(),
  };
}

export function useGridmasterRealtimeInvalidation({
  enabled,
  queryClient,
}: {
  enabled: boolean;
  queryClient: QueryClient;
}) {
  useEffect(() => {
    if (!enabled) return;

    const batcher = createGridmasterInvalidationBatcher(queryClient);
    const handleChange = (table: GridmasterRealtimeTable, payload: RealtimePayload) => {
      for (const orgId of resolveGridmasterRealtimeOrgIds(payload)) {
        for (const userId of resolveGridmasterRealtimeUserIds(table, payload)) {
          batcher.markChanged(table, orgId, userId);
        }
      }
    };

    // Gridmaster is platform-wide: the platform topic carries every change,
    // with the organizations and people each statement touched.
    const tables: GridmasterRealtimeTable[] = [
      "organizations",
      "audit_log",
      "impersonation_sessions",
      ...ORG_FILTER_TABLES,
    ];

    const unsubscribe = subscribeToTableChanges<GridmasterRealtimeTable>(
      getBrowserSupabaseClient(),
      tables.map((table) => ({ table, topic: PLATFORM_TOPIC, onEvent: handleChange })),
      {
        onReconnectAfterError: () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.all() });
        },
        onError: (error) => {
          Sentry.captureException(error);
        },
      },
    );
    return () => {
      batcher.dispose();
      unsubscribe();
    };
  }, [enabled, queryClient]);
}
