/**
 * Display helpers for the activity / audit log views.
 *
 * The vocabulary itself — headlines, categories, severities, resource-type
 * names — lives in `@/lib/audit/registry`. This module is the thin layer the
 * three views share on top of it: entry-shaped wrappers, date grouping, search
 * matching, and the actor/target labels.
 */

import type { FullAuditLogEntry } from "@/types";
import { addDaysToIsoDate, formatDate, getIsoDateInTimeZone } from "@dubgrid/schedule-core";
import {
  AuditDetails,
  flattenDetails,
  formatShortDate,
  titleCase,
  type DetailItem,
} from "@/lib/audit/details";
import {
  ALWAYS_SUPPRESSED_DETAIL_KEYS,
  AUDIT_CATEGORY_OPTIONS,
  describeUnknownAction,
  getAuditActionSpec,
  getAuditCategory,
  getAuditCategoryLabel,
  getAuditSeverity,
  getResourceTypeLabel,
  matchesAuditCategory,
  type ActionSeverity,
  type AuditContext,
  type AuditCategoryOption,
} from "@/lib/audit/registry";

export type { DetailItem, ActionSeverity };

/** An audit-shaped entry from any source; the id type is the only thing that varies. */
export type ActivityEntryLike = Partial<Omit<FullAuditLogEntry, "id">>;
export { getResourceTypeLabel, getAuditCategoryLabel, AUDIT_CATEGORY_OPTIONS, formatShortDate };
export { formatRelativeTime } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type ActivityCategory = AuditCategoryOption;

/** Derived from the registry, so a new action can't land in no category. */
export const ACTIVITY_CATEGORIES: ActivityCategory[] = AUDIT_CATEGORY_OPTIONS;

export function getCategoryForAction(action: string): ActivityCategory {
  const label = getAuditCategoryLabel(action);
  return ACTIVITY_CATEGORIES.find((c) => c.label === label) ?? ACTIVITY_CATEGORIES[0];
}

export function matchesCategory(action: string, categoryValue: string): boolean {
  return matchesAuditCategory(action, categoryValue);
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export function getActionSeverity(action: string): ActionSeverity {
  return getAuditSeverity(action);
}

// ---------------------------------------------------------------------------
// Descriptions
// ---------------------------------------------------------------------------

function contextFromEntry(entry: ActivityEntryLike): AuditContext {
  return {
    targetLabel: entry.targetLabel ?? null,
    targetEmail: entry.targetEmail ?? null,
    orgName: entry.orgName ?? null,
    resourceId: entry.resourceId ?? null,
    resourceType: entry.resourceType ?? "",
  };
}

function detailsOf(entry: ActivityEntryLike): Record<string, unknown> {
  const raw = entry.details;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export function describeAction(entry: ActivityEntryLike & { action: string }): string {
  const spec = getAuditActionSpec(entry.action);
  if (!spec) return describeUnknownAction(entry.action);
  return spec.headline(new AuditDetails(detailsOf(entry)), contextFromEntry(entry));
}

export function describeAuditEvent(action: string, details: Record<string, unknown> = {}): string {
  return describeAction({ action, details });
}

// ---------------------------------------------------------------------------
// Detail rows
// ---------------------------------------------------------------------------

export function formatDetails(entry: ActivityEntryLike & { action: string }): DetailItem[] {
  const details = detailsOf(entry);
  if (Object.keys(details).length === 0) return [];

  const spec = getAuditActionSpec(entry.action);
  if (spec?.details) {
    return spec.details(new AuditDetails(details), contextFromEntry(entry));
  }

  const skipKeys = spec?.suppressKeys
    ? new Set([...ALWAYS_SUPPRESSED_DETAIL_KEYS, ...spec.suppressKeys])
    : ALWAYS_SUPPRESSED_DETAIL_KEYS;

  return flattenDetails(details, { skipKeys });
}

/** Compact inline summary for a table cell. */
export function summarizeDetails(entry: ActivityEntryLike & { action: string }): string {
  const items = formatDetails(entry);
  if (items.length === 0) return "—";
  return items.map((i) => `${i.label}: ${i.value}`).join(" · ");
}

// ---------------------------------------------------------------------------
// Actor / target labels
// ---------------------------------------------------------------------------

export function getAuditActorLabel(entry: ActivityEntryLike): string {
  const initiatedBy = detailsOf(entry).initiated_by;
  if (initiatedBy === "gridmaster" || initiatedBy === "gridmaster_sync") {
    return "Gridmaster";
  }
  return entry.actorName ?? entry.actorEmail ?? "System";
}

export function getAuditActorSecondaryLabel(entry: ActivityEntryLike): string | null {
  if (getAuditActorLabel(entry) === "Gridmaster") return null;
  return entry.actorName ? (entry.actorEmail ?? null) : null;
}

export function getAuditTargetLabel(entry: ActivityEntryLike): string {
  return entry.targetLabel ?? getResourceTypeLabel(entry.resourceType ?? "");
}

// ---------------------------------------------------------------------------
// Grouping across time
// ---------------------------------------------------------------------------

export interface ActivityDayGroup<T> {
  dateKey: string;
  label: string;
  entries: T[];
}

/**
 * Buckets entries into the organization's calendar days, newest day first.
 *
 * The timezone is the organization's, never the reader's: a manager in Denver
 * looking at a Boston facility has to see the facility's Tuesday, and the day
 * headings have to line up with the range the query asked the database for.
 * `todayDate` is passed in rather than read from the clock so the labels agree
 * with the period navigation and stay deterministic under test.
 */
export function groupByDay<T extends { createdAt: string }>(
  entries: T[],
  options: { timeZone: string | null; todayDate: string },
): ActivityDayGroup<T>[] {
  const groups = new Map<string, ActivityDayGroup<T>>();

  for (const entry of entries) {
    const dateKey = getIsoDateInTimeZone(new Date(entry.createdAt), options.timeZone);
    const existing = groups.get(dateKey);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.set(dateKey, {
        dateKey,
        label: formatActivityDayLabel(dateKey, options.todayDate),
        entries: [entry],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

export function formatActivityDayLabel(dateKey: string, todayDate: string): string {
  if (dateKey === todayDate) return "Today";
  if (dateKey === addDaysToIsoDate(todayDate, -1)) return "Yesterday";
  return formatDate(dateKey, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/** The full date, for the muted line beside a Today or Yesterday heading. */
export function formatActivityDayDate(dateKey: string): string {
  return formatDate(dateKey, { month: "long", day: "numeric", year: "numeric" });
}

export interface ActivityCategoryCount {
  value: string;
  label: string;
  count: number;
}

/** What kinds of thing happened in this period, most frequent first. */
export function summarizeCategories(entries: { action: string }[]): ActivityCategoryCount[] {
  const counts = new Map<string, ActivityCategoryCount>();

  for (const entry of entries) {
    const value = getAuditCategory(entry.action) ?? "other";
    const existing = counts.get(value);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(value, { value, label: getAuditCategoryLabel(entry.action), count: 1 });
    }
  }

  return Array.from(counts.values()).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

/**
 * Whether an entry matches a typed query, over everything the row shows: its
 * description, who did it, what it touched, its category, and its detail rows.
 * Client-side, for views that already hold the whole period in memory.
 */
export function matchesActivitySearch(
  entry: ActivityEntryLike & { action: string },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const haystack = [
    describeAction(entry),
    getAuditActorLabel(entry),
    entry.actorEmail ?? "",
    getAuditTargetLabel(entry),
    entry.targetEmail ?? "",
    getAuditCategoryLabel(entry.action),
    getResourceTypeLabel(entry.resourceType ?? ""),
    ...formatDetails(entry).map((item) => `${item.label} ${item.value}`),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

/** How many distinct people acted in this period, by the label the log shows. */
export function countActors(entries: ActivityEntryLike[]): number {
  const actors = new Set<string>();
  for (const entry of entries) actors.add(getAuditActorLabel(entry));
  return actors.size;
}

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

/** "10:21 AM" in the org's zone. The day is already named by its heading. */
export function formatActivityTime(createdAt: string, timeZone: string | null): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timeZone ?? "UTC",
  }).format(date);
}

/** "Sep 2, 2026, 10:21 AM EDT", for hints and the details dialog. */
export function formatActivityTimestamp(createdAt: string, timeZone: string | null): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: timeZone ?? "UTC",
  }).format(date);
}

/** Retained for callers that still need to humanize an arbitrary token. */
export { titleCase };
