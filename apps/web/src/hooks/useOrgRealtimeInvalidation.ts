"use client";

import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { subscribeOrgScopedRealtime, type RealtimeChangePayload } from "@dubgrid/realtime-core";
import * as Sentry from "@/lib/sentry";
import { broadcastInvalidation } from "@/lib/cache-broadcast";
import { queryKeys } from "@/lib/query-keys";
import { uniqueKeys } from "@/lib/realtime-invalidation";
import { getBrowserSupabaseClient } from "@/features/account/client";
import type { DirectoryPerson } from "@/types";

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
  "organizations",
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

/** What the drafts topic carries: draft cells, snapshots and notes (140). */
const DRAFT_TABLES: OrgRealtimeTable[] = [
  "schedule_cells",
  "schedule_cell_snapshots",
  "schedule_cell_segments",
  "schedule_notes",
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
    // The operations report reads published cells only, so a draft edit leaves
    // it alone; `changesPublishedSchedule` adds it when a published snapshot moves.
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
      return uniqueKeys([queryKeys.org.auditLog(orgId)]);
  }
}

/**
 * Whether an event changed what was published. Every publish, approval and
 * past-day correction upserts the cell's published snapshot, and a correction
 * writes no publish_history row, so this is the report's only signal for one.
 * A draft snapshot arrives on the drafts topic instead (migration 140).
 */
export function changesPublishedSchedule(
  table: OrgRealtimeTable,
  payload: RealtimeChangePayload,
): boolean {
  return table === "schedule_cell_snapshots" && payload.scope !== "drafts";
}

export function getOrgRealtimeFlushKeys(
  orgId: string,
  tables: readonly OrgRealtimeTable[],
  publishedChanged: boolean,
): readonly unknown[][] {
  const keys: (readonly unknown[])[] = tables.flatMap((table) =>
    getOrgRealtimeInvalidationKeys(orgId, table),
  );
  if (publishedChanged) keys.push(queryKeys.reports.operationsAll(orgId));
  return uniqueKeys(keys);
}

/**
 * Invalidates each key once per flush. A cell save touches three tables that
 * share keys, and the default cancelRefetch restarted the same fetch for each.
 */
export function invalidateOrgRealtimeQueries(
  queryClient: QueryClient,
  orgId: string,
  tables: readonly OrgRealtimeTable[],
  publishedChanged = false,
): void {
  for (const queryKey of getOrgRealtimeFlushKeys(orgId, tables, publishedChanged)) {
    void queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
    broadcastInvalidation(queryKey);
  }
}

// The cached version goes back to the server, which refuses one without an offset.
function isTimestampWithOffset(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /(Z|[+-]\d\d:\d\d)$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

/**
 * Opening Schedule stamps schedule_last_viewed_at on the viewer's membership,
 * which also moves its updated_at. The database says when a statement changed
 * nothing else (140), so the cached directory moves those people's version
 * forward in place (role and permission edits send it back for their conflict
 * check) instead of refetching in every tab. Anyone it doesn't hold sends the
 * event on to a refetch.
 */
export function absorbMembershipViewStamp(
  queryClient: QueryClient,
  orgId: string,
  payload: RealtimeChangePayload,
): boolean {
  const stamps = payload.viewStamps;
  if (payload.eventType !== "UPDATE" || !stamps || stamps.length === 0) return false;
  if (!stamps.every((stamp) => isTimestampWithOffset(stamp.updatedAt))) return false;

  const directoryKey = queryKeys.org.directory(orgId);
  const directory = queryClient.getQueryData<DirectoryPerson[]>(directoryKey);
  if (!directory) return false;
  const stampByUser = new Map(stamps.map((stamp) => [stamp.userId, stamp.updatedAt]));
  const held = (entry: DirectoryPerson) =>
    entry.userId != null && entry.source !== "pending_invite" && stampByUser.has(entry.userId);
  if (directory.filter(held).length < stampByUser.size) return false;

  queryClient.setQueryData<DirectoryPerson[]>(directoryKey, (current) =>
    current?.map((entry) =>
      held(entry) && entry.membershipUpdatedAt != null
        ? { ...entry, membershipUpdatedAt: stampByUser.get(entry.userId as string) as string }
        : entry,
    ),
  );
  return true;
}

/**
 * One shared subscription per organization and topic, reference-counted.
 *
 * useOrgRealtimeInvalidation is called from useOrganizationData and
 * useEmployees, which between them have 21 call sites and several mount
 * simultaneously on one page; one subscription runs each change's
 * invalidation, and its cross-tab broadcast, once. The drafts topic is its
 * own subscription, held only by people who edit the schedule.
 */
const orgSubscriptions = new Map<string, { count: number; unsubscribe: () => void }>();

function acquireOrgSubscription(
  orgId: string,
  queryClient: QueryClient,
  drafts: boolean,
): () => void {
  const key = drafts ? `${orgId}:drafts` : orgId;
  const existing = orgSubscriptions.get(key);
  if (existing) {
    existing.count += 1;
  } else {
    let publishedChanged = false;
    const unsubscribe = subscribeOrgScopedRealtime<OrgRealtimeTable>({
      client: getBrowserSupabaseClient(),
      orgId,
      tables: drafts ? DRAFT_TABLES : ORG_FILTER_TABLES,
      includeDrafts: drafts,
      // A bulk save sends one change per statement, and a save touches
      // several tables at once: collect them and invalidate once per burst.
      debounceMs: 150,
      skipEvent: (table, payload) => {
        if (changesPublishedSchedule(table, payload)) publishedChanged = true;
        return (
          table === "organization_memberships" &&
          absorbMembershipViewStamp(queryClient, orgId, payload)
        );
      },
      onFlush: (tables) => {
        const published = publishedChanged;
        publishedChanged = false;
        invalidateOrgRealtimeQueries(queryClient, orgId, tables, published);
      },
      onReconnectAfterError: () => {
        if (drafts) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.shifts.all(orgId) });
          return;
        }
        void queryClient.invalidateQueries({
          queryKey: queryKeys.org.bootstrap(),
        });
        // Requests can change hands while the socket is down; useShiftRequests
        // relies on this channel now instead of one of its own, and used to
        // refetch on its own reconnect.
        void queryClient.invalidateQueries({
          queryKey: queryKeys.shiftRequests.all(orgId),
        });
      },
      onError: (error) => {
        Sentry.captureException(error);
      },
    });
    orgSubscriptions.set(key, { count: 1, unsubscribe });
  }

  let released = false;
  return () => {
    // Guard against a double release: React can run a cleanup more than once,
    // and decrementing twice would tear down a channel other consumers hold.
    if (released) return;
    released = true;
    const entry = orgSubscriptions.get(key);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count <= 0) {
      orgSubscriptions.delete(key);
      entry.unsubscribe();
    }
  };
}

export function useOrgRealtimeInvalidation({
  orgId,
  queryClient,
  includeDrafts = false,
}: {
  orgId: string | null;
  queryClient: QueryClient;
  /** Also follow draft edits; only someone who edits the schedule may. */
  includeDrafts?: boolean;
}) {
  useEffect(() => {
    if (!orgId) return;
    return acquireOrgSubscription(orgId, queryClient, false);
  }, [orgId, queryClient]);

  useEffect(() => {
    if (!orgId || !includeDrafts) return;
    return acquireOrgSubscription(orgId, queryClient, true);
  }, [orgId, queryClient, includeDrafts]);
}
