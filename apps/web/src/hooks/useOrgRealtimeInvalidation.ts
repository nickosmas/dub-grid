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
  | "audit_log";

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

export function getOrgRealtimeInvalidationKeys(
  orgId: string,
  table: OrgRealtimeTable,
): readonly unknown[][] {
  const bootstrap = queryKeys.org.bootstrapAll();
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
      ]);
    case "organization_memberships":
      return uniqueKeys([queryKeys.org.users(orgId), queryKeys.org.directory(orgId)]);
    case "shift_requests":
      return uniqueKeys([queryKeys.shiftRequests.all(orgId), queryKeys.shifts.all(orgId)]);
    case "schedule_cells":
    case "schedule_cell_snapshots":
    case "schedule_cell_segments":
      return uniqueKeys([queryKeys.shifts.all(orgId), queryKeys.shiftRequests.all(orgId)]);
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
      return uniqueKeys([queryKeys.recurringShifts.all(orgId), queryKeys.shifts.all(orgId)]);
    case "publish_history":
      return uniqueKeys([queryKeys.org.publishHistory(orgId), queryKeys.shifts.all(orgId)]);
    case "audit_log":
      return uniqueKeys([queryKeys.org.auditLog(orgId)]);
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

export function useOrgRealtimeInvalidation({
  orgId,
  disabled = false,
  queryClient,
}: {
  orgId: string | null;
  disabled?: boolean;
  queryClient: QueryClient;
}) {
  useEffect(() => {
    if (!orgId || disabled) return;

    let hadError = false;
    const channelId = `org-freshness:${orgId}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const channel = createBrowserRealtimeChannel(channelId);

    // Coalesce bursts: a bulk save (e.g. saving N departments) emits one
    // postgres_changes event per row. Rather than running the full
    // invalidation set N times — and broadcasting it to every other tab N
    // times — accumulate the affected tables and flush once on a short
    // debounce. Correctness is unchanged: each changed table is still
    // invalidated, just once per burst.
    const pendingTables = new Set<OrgRealtimeTable>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      flushTimer = null;
      const tables = [...pendingTables];
      pendingTables.clear();
      for (const table of tables) {
        invalidateOrgRealtimeQueries(queryClient, orgId, table);
      }
    };
    const handleChange = (table: OrgRealtimeTable) => {
      pendingTables.add(table);
      if (flushTimer === null) {
        flushTimer = setTimeout(flush, 150);
      }
    };

    channel.on(
      "postgres_changes" as "system",
      {
        event: "*",
        schema: "public",
        table: "organizations",
        filter: `id=eq.${orgId}`,
      } as Record<string, unknown>,
      () => handleChange("organizations"),
    );

    for (const table of ORG_FILTER_TABLES) {
      channel.on(
        "postgres_changes" as "system",
        {
          event: "*",
          schema: "public",
          table,
          filter: `org_id=eq.${orgId}`,
        } as Record<string, unknown>,
        () => handleChange(table),
      );
    }

    channel.subscribe((status: string, err?: Error) => {
      if (status === "SUBSCRIBED" && hadError) {
        hadError = false;
        void queryClient.invalidateQueries({
          queryKey: queryKeys.org.bootstrapAll(),
        });
      } else if (status === "CHANNEL_ERROR") {
        hadError = true;
        Sentry.captureException(err ?? new Error("org freshness channel error"));
      }
    });

    return () => {
      if (flushTimer !== null) clearTimeout(flushTimer);
      void removeBrowserRealtimeChannel(channel);
    };
  }, [disabled, orgId, queryClient]);
}
