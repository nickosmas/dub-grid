"use client";

import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { subscribeOrgScopedRealtime } from "@dubgrid/realtime-core";
import * as Sentry from "@/lib/sentry";
import { broadcastInvalidation } from "@/lib/cache-broadcast";
import { queryKeys } from "@/lib/query-keys";
import { uniqueKeys } from "@/lib/realtime-invalidation";
import { getBrowserSupabaseClient } from "@/features/account/client";

type OrgRealtimeTable =
  | "organizations"
  | "subscriptions"
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
  | "shift_requests"
  | "schedule_cells"
  | "schedule_cell_snapshots"
  | "schedule_cell_segments"
  | "schedule_notes"
  | "profile_change_requests"
  | "invitations"
  | "recurring_shifts"
  | "publish_history"
  | "audit_log"
  | "role_change_log";

const ORG_FILTER_TABLES: OrgRealtimeTable[] = [
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
  "shift_requests",
  "schedule_cells",
  "schedule_cell_snapshots",
  "schedule_cell_segments",
  "schedule_notes",
  "subscriptions",
  "profile_change_requests",
  "invitations",
  "recurring_shifts",
  "publish_history",
  "audit_log",
  "role_change_log",
];

export function getOrgRealtimeInvalidationKeys(
  orgId: string,
  table: OrgRealtimeTable,
): readonly unknown[][] {
  const bootstrap = queryKeys.org.bootstrap();
  const detail = queryKeys.org.detail(orgId);

  switch (table) {
    case "organizations":
      return uniqueKeys([bootstrap, detail, queryKeys.org.billing(orgId)]);
    case "subscriptions":
      return uniqueKeys([queryKeys.org.billing(orgId), bootstrap, detail]);
    case "focus_areas":
      return uniqueKeys([
        bootstrap,
        queryKeys.org.focusAreas(orgId),
        queryKeys.org.assignments(orgId),
        queryKeys.org.coverageRequirements(orgId),
      ]);
    case "jobs":
      return uniqueKeys([
        bootstrap,
        queryKeys.org.jobs(orgId),
        queryKeys.org.assignments(orgId),
        queryKeys.org.coverageRequirements(orgId),
      ]);
    case "absence_types":
      return uniqueKeys([bootstrap, queryKeys.org.absenceTypes(orgId)]);
    case "coverage_requirements":
      return uniqueKeys([bootstrap, queryKeys.org.coverageRequirements(orgId)]);
    case "departments":
      return uniqueKeys([
        bootstrap,
        queryKeys.org.departments(orgId),
        queryKeys.org.directory(orgId),
        queryKeys.employees.all(orgId),
      ]);
    case "shift_categories":
      return uniqueKeys([
        bootstrap,
        queryKeys.org.shiftCategories(orgId),
        queryKeys.org.assignments(orgId),
        queryKeys.org.jobs(orgId),
      ]);
    case "certifications":
      return uniqueKeys([
        bootstrap,
        queryKeys.org.certifications(orgId),
        queryKeys.org.assignments(orgId),
        queryKeys.org.directory(orgId),
        queryKeys.employees.all(orgId),
      ]);
    case "organization_roles":
      return uniqueKeys([
        bootstrap,
        queryKeys.org.orgRoles(orgId),
        queryKeys.org.assignments(orgId),
        queryKeys.org.directory(orgId),
        queryKeys.employees.all(orgId),
      ]);
    case "indicator_types":
      return uniqueKeys([bootstrap, queryKeys.org.indicatorTypes(orgId)]);
    case "employees":
      return uniqueKeys([
        queryKeys.employees.all(orgId),
        queryKeys.org.employeeCount(orgId),
        queryKeys.org.directory(orgId),
        queryKeys.shiftRequests.all(orgId),
        queryKeys.reports.operationsAll(orgId),
      ]);
    case "organization_memberships":
      return uniqueKeys([queryKeys.org.users(orgId), queryKeys.org.directory(orgId)]);
    case "shift_requests":
      return uniqueKeys([queryKeys.shiftRequests.all(orgId), queryKeys.shifts.all(orgId)]);
    case "schedule_cells":
    case "schedule_cell_snapshots":
    case "schedule_cell_segments":
      return uniqueKeys([
        queryKeys.shifts.all(orgId),
        queryKeys.shiftRequests.all(orgId),
        queryKeys.reports.operationsAll(orgId),
      ]);
    case "schedule_notes":
      return uniqueKeys([queryKeys.shifts.all(orgId)]);
    case "profile_change_requests":
      return uniqueKeys([queryKeys.org.peopleChangeRequests(orgId, "pending")]);
    case "invitations":
      return uniqueKeys([
        queryKeys.org.invitations(orgId),
        queryKeys.org.directory(orgId),
        queryKeys.org.users(orgId),
        queryKeys.org.employeeCount(orgId),
      ]);
    case "recurring_shifts":
      return uniqueKeys([
        queryKeys.recurringShifts.all(orgId),
        queryKeys.shifts.all(orgId),
        queryKeys.reports.operationsAll(orgId),
      ]);
    case "publish_history":
      return uniqueKeys([
        queryKeys.org.publishHistory(orgId),
        queryKeys.shifts.all(orgId),
        queryKeys.reports.operationsAll(orgId),
      ]);
    case "audit_log":
      return uniqueKeys([queryKeys.org.auditLog(orgId)]);
    case "role_change_log":
      return uniqueKeys([queryKeys.org.auditLog(orgId), queryKeys.org.roleHistory(orgId)]);
  }
}

export function invalidateOrgRealtimeQueries(
  queryClient: QueryClient,
  orgId: string,
  table: OrgRealtimeTable,
): void {
  for (const queryKey of getOrgRealtimeInvalidationKeys(orgId, table)) {
    void queryClient.invalidateQueries({ queryKey });
    broadcastInvalidation(queryKey);
  }
}

/**
 * One shared subscription per org, reference-counted.
 *
 * useOrgRealtimeInvalidation is called from useOrganizationData and
 * useEmployees, which between them have 21 call sites and several mount
 * simultaneously on one page. Each instance used to open its own channel over
 * all 23 tables, so a single CDC event ran the full invalidation set — and its
 * cross-tab broadcast — once per mounted instance. Debouncing did not help:
 * it is per subscription, so it coalesced within a channel, never across them.
 *
 */
const orgSubscriptions = new Map<string, { count: number; unsubscribe: () => void }>();

function acquireOrgSubscription(orgId: string, queryClient: QueryClient): () => void {
  const existing = orgSubscriptions.get(orgId);
  if (existing) {
    existing.count += 1;
  } else {
    const unsubscribe = subscribeOrgScopedRealtime<OrgRealtimeTable>({
      client: getBrowserSupabaseClient(),
      orgId,
      tables: ORG_FILTER_TABLES,
      rowScopedTable: "organizations",
      // Coalesce bursts: a bulk save (e.g. saving N departments) emits one
      // postgres_changes event per row. Rather than running the full
      // invalidation set N times — and broadcasting it to every other tab N
      // times — accumulate the affected tables and flush once on a short
      // debounce. Correctness is unchanged: each changed table is still
      // invalidated, just once per burst.
      debounceMs: 150,
      channelNamePrefix: `org-freshness:${orgId}`,
      onFlush: (tables) => {
        for (const table of tables) {
          invalidateOrgRealtimeQueries(queryClient, orgId, table);
        }
      },
      onReconnectAfterError: () => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.org.bootstrap(),
        });
      },
      onError: (error) => {
        Sentry.captureException(error);
      },
    });
    orgSubscriptions.set(orgId, { count: 1, unsubscribe });
  }

  let released = false;
  return () => {
    // Guard against a double release: React can run a cleanup more than once,
    // and decrementing twice would tear down a channel other consumers hold.
    if (released) return;
    released = true;
    const entry = orgSubscriptions.get(orgId);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count <= 0) {
      orgSubscriptions.delete(orgId);
      entry.unsubscribe();
    }
  };
}

export function useOrgRealtimeInvalidation({
  orgId,
  queryClient,
}: {
  orgId: string | null;
  queryClient: QueryClient;
}) {
  useEffect(() => {
    if (!orgId) return;
    return acquireOrgSubscription(orgId, queryClient);
  }, [orgId, queryClient]);
}
