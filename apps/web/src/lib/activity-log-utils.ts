/**
 * Display helpers for the activity / audit log views.
 *
 * The vocabulary itself — headlines, categories, severities, resource-type
 * names — lives in `@/lib/audit/registry`. This module is the thin layer the
 * three views share on top of it: entry-shaped wrappers, date grouping, search
 * matching, and the actor/target labels.
 */

import type { FullAuditLogEntry } from "@/types";
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
  getAuditCategoryLabel,
  getAuditSeverity,
  getResourceTypeLabel,
  matchesAuditCategory,
  type ActionSeverity,
  type AuditContext,
  type AuditCategoryOption,
} from "@/lib/audit/registry";

export type { DetailItem, ActionSeverity };
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

export function severityColor(severity: ActionSeverity): {
  bg: string;
  border: string;
  fg: string;
} {
  switch (severity) {
    case "create":
      return {
        bg: "var(--dg-color-success-bg, #f0fdf4)",
        border: "var(--dg-color-success-border, #bbf7d0)",
        fg: "var(--dg-color-success-text, #166534)",
      };
    case "delete":
      return {
        bg: "var(--dg-color-danger-bg, #fde8e8)",
        border: "var(--dg-color-danger-border, #fecaca)",
        fg: "var(--dg-color-danger-text, #b91c1c)",
      };
    case "warning":
      return {
        bg: "var(--dg-color-warning-bg, #fff8e6)",
        border: "var(--dg-color-warning-border, #fde68a)",
        fg: "var(--dg-color-warning-text, #92400e)",
      };
    case "update":
      return {
        bg: "var(--dg-color-bg-secondary)",
        border: "var(--dg-color-border)",
        fg: "var(--dg-color-text-primary)",
      };
  }
}

// ---------------------------------------------------------------------------
// Descriptions
// ---------------------------------------------------------------------------

function contextFromEntry(entry: Partial<FullAuditLogEntry>): AuditContext {
  return {
    targetLabel: entry.targetLabel ?? null,
    targetEmail: entry.targetEmail ?? null,
    orgName: entry.orgName ?? null,
    resourceId: entry.resourceId ?? null,
    resourceType: entry.resourceType ?? "",
  };
}

function detailsOf(entry: Partial<FullAuditLogEntry>): Record<string, unknown> {
  const raw = entry.details;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export function describeAction(entry: Partial<FullAuditLogEntry> & { action: string }): string {
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

export function formatDetails(
  entry: Partial<FullAuditLogEntry> & { action: string },
): DetailItem[] {
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
export function summarizeDetails(entry: Partial<FullAuditLogEntry> & { action: string }): string {
  const items = formatDetails(entry);
  if (items.length === 0) return "—";
  return items.map((i) => `${i.label}: ${i.value}`).join(" · ");
}

// ---------------------------------------------------------------------------
// Actor / target labels
// ---------------------------------------------------------------------------

export function getAuditActorLabel(entry: Partial<FullAuditLogEntry>): string {
  const initiatedBy = detailsOf(entry).initiated_by;
  if (initiatedBy === "gridmaster" || initiatedBy === "gridmaster_sync") {
    return "Gridmaster";
  }
  return entry.actorName ?? entry.actorEmail ?? "System";
}

export function getAuditActorSecondaryLabel(entry: Partial<FullAuditLogEntry>): string | null {
  if (getAuditActorLabel(entry) === "Gridmaster") return null;
  return entry.actorName ? (entry.actorEmail ?? null) : null;
}

export function getAuditTargetLabel(entry: Partial<FullAuditLogEntry>): string {
  return entry.targetLabel ?? getResourceTypeLabel(entry.resourceType ?? "");
}

// ---------------------------------------------------------------------------
// Date grouping
// ---------------------------------------------------------------------------

export interface DateGroup {
  label: string;
  entries: FullAuditLogEntry[];
}

export function groupByDate(entries: FullAuditLogEntry[]): DateGroup[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const groups = new Map<string, DateGroup>();

  for (const entry of entries) {
    const d = new Date(entry.createdAt);
    const dateStr = d.toDateString();

    let label: string;
    if (dateStr === todayStr) label = "Today";
    else if (dateStr === yesterdayStr) label = "Yesterday";
    else
      label = d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });

    const existing = groups.get(dateStr);
    if (existing) existing.entries.push(entry);
    else groups.set(dateStr, { label, entries: [entry] });
  }

  return Array.from(groups.values());
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function matchesSearch(
  entry: FullAuditLogEntry,
  query: string,
  description: string,
): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    description.toLowerCase().includes(q) ||
    (entry.actorName ?? "").toLowerCase().includes(q) ||
    (entry.actorEmail ?? "").toLowerCase().includes(q) ||
    (entry.targetLabel ?? "").toLowerCase().includes(q) ||
    (entry.targetEmail ?? "").toLowerCase().includes(q) ||
    getAuditCategoryLabel(entry.action).toLowerCase().includes(q) ||
    getResourceTypeLabel(entry.resourceType).toLowerCase().includes(q)
  );
}

/** Retained for callers that still need to humanize an arbitrary token. */
export { titleCase };
