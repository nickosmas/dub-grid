"use client";

import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import * as Sentry from "@/lib/sentry";
import { broadcastInvalidation } from "@/lib/cache-broadcast";
import { queryKeys } from "@/lib/query-keys";
import {
  createBrowserRealtimeChannel,
  removeBrowserRealtimeChannel,
} from "@/features/account/client";

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

type RealtimePayload = {
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
};

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

function uniqueKeys(keys: readonly (readonly unknown[])[]): readonly unknown[][] {
  const seen = new Set<string>();
  const unique: unknown[][] = [];
  for (const key of keys) {
    const cacheKey = JSON.stringify(key);
    if (seen.has(cacheKey)) continue;
    seen.add(cacheKey);
    unique.push([...key]);
  }
  return unique;
}

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
    case "user_sessions":
      return uniqueKeys([queryKeys.gridmaster.security(), queryKeys.gridmaster.compliance()]);
    case "profiles":
      return uniqueKeys([
        queryKeys.gridmaster.accounts(),
        queryKeys.gridmaster.allUsers(),
        ...platformSummaryKeys,
      ]);
    case "employees":
      return uniqueKeys([
        ...platformSummaryKeys,
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
        ...(userId ? [queryKeys.gridmaster.userMemberships(userId)] : []),
      ]);
    case "invitations":
      return uniqueKeys([
        ...platformSummaryKeys,
        queryKeys.gridmaster.auditAll(),
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

export function resolveGridmasterRealtimeOrgId(
  table: GridmasterRealtimeTable,
  payload: RealtimePayload,
): string | null {
  const row = payload.new ?? payload.old ?? {};
  const key =
    table === "organizations"
      ? "id"
      : table === "impersonation_sessions"
        ? "target_org_id"
        : "org_id";
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Resolves the affected user's id, for tables where invalidation targets a
 * per-user query (currently just `organization_memberships` →
 * `queryKeys.gridmaster.userMemberships(userId)`). */
export function resolveGridmasterRealtimeUserId(
  table: GridmasterRealtimeTable,
  payload: RealtimePayload,
): string | null {
  if (table !== "organization_memberships") return null;
  const row = payload.new ?? payload.old ?? {};
  const value = row.user_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function invalidateGridmasterRealtimeQueries(
  queryClient: QueryClient,
  table: GridmasterRealtimeTable,
  orgId: string | null,
  userId: string | null = null,
): void {
  for (const queryKey of getGridmasterRealtimeInvalidationKeys(table, orgId, userId)) {
    void queryClient.invalidateQueries({ queryKey });
    broadcastInvalidation(queryKey);
  }
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

    let hadError = false;
    const channelId = `gridmaster-freshness:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const channel = createBrowserRealtimeChannel(channelId);
    const handleChange = (table: GridmasterRealtimeTable, payload: RealtimePayload) => {
      invalidateGridmasterRealtimeQueries(
        queryClient,
        table,
        resolveGridmasterRealtimeOrgId(table, payload),
        resolveGridmasterRealtimeUserId(table, payload),
      );
    };

    channel.on(
      "postgres_changes" as "system",
      { event: "*", schema: "public", table: "organizations" } as Record<string, unknown>,
      (payload: RealtimePayload) => handleChange("organizations", payload),
    );
    channel.on(
      "postgres_changes" as "system",
      { event: "*", schema: "public", table: "audit_log" } as Record<string, unknown>,
      (payload: RealtimePayload) => handleChange("audit_log", payload),
    );
    channel.on(
      "postgres_changes" as "system",
      { event: "*", schema: "public", table: "impersonation_sessions" } as Record<string, unknown>,
      (payload: RealtimePayload) => handleChange("impersonation_sessions", payload),
    );

    for (const table of ORG_FILTER_TABLES) {
      channel.on(
        "postgres_changes" as "system",
        { event: "*", schema: "public", table } as Record<string, unknown>,
        (payload: RealtimePayload) => handleChange(table, payload),
      );
    }

    channel.subscribe((status: string, err?: Error) => {
      if (status === "SUBSCRIBED" && hadError) {
        hadError = false;
        void queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.all() });
      } else if (status === "CHANNEL_ERROR") {
        hadError = true;
        Sentry.captureException(err ?? new Error("gridmaster freshness channel error"));
      }
    });

    return () => {
      void removeBrowserRealtimeChannel(channel);
    };
  }, [enabled, queryClient]);
}
