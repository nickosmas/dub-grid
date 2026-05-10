import type { FullAuditLogEntry } from "@/types";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface ActivityCategory {
  value: string;
  label: string;
  /** Comma-separated action prefixes matched by this category */
  prefixes: string[];
}

export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  { value: "all", label: "All Activity", prefixes: [] },
  { value: "employee", label: "Employee", prefixes: ["employee."] },
  { value: "shift", label: "Shifts", prefixes: ["shift."] },
  { value: "schedule", label: "Schedule", prefixes: ["schedule."] },
  { value: "shift_request", label: "Shift Requests", prefixes: ["shift_request."] },
  { value: "access", label: "Access & Roles", prefixes: ["role.", "permissions.", "user."] },
  { value: "invitation", label: "Invitations", prefixes: ["invitation."] },
  { value: "config", label: "Configuration", prefixes: ["focus_area.", "assignment.", "shift_category.", "job.", "absence_type.", "indicator_type.", "certifications.", "org_roles.", "coverage_requirements.", "coverage_rule_config."] },
  { value: "recurring", label: "Recurring", prefixes: ["recurring_shift.", "recurring_schedule.", "shift_series."] },
  { value: "org", label: "Organization", prefixes: ["org."] },
  { value: "impersonation", label: "Impersonation", prefixes: ["impersonation."] },
  { value: "billing", label: "Billing", prefixes: ["billing."] },
  { value: "data", label: "Data Export", prefixes: ["data."] },
  { value: "schedule_note", label: "Notes", prefixes: ["schedule_note."] },
];

export function getCategoryForAction(action: string): ActivityCategory {
  return ACTIVITY_CATEGORIES.find(
    (c) => c.prefixes.length > 0 && c.prefixes.some((p) => action.startsWith(p)),
  ) ?? ACTIVITY_CATEGORIES[0];
}

export function matchesCategory(action: string, categoryValue: string): boolean {
  if (categoryValue === "all") return true;
  const cat = ACTIVITY_CATEGORIES.find((c) => c.value === categoryValue);
  if (!cat || cat.prefixes.length === 0) return true;
  return cat.prefixes.some((p) => action.startsWith(p));
}

// ---------------------------------------------------------------------------
// Severity (for dot colors)
// ---------------------------------------------------------------------------

export type ActionSeverity = "create" | "update" | "delete" | "warning";

export function getActionSeverity(action: string): ActionSeverity {
  if (
    action.includes("created") ||
    action.includes("restored") ||
    action.includes("activated") ||
    action.includes("accepted") ||
    action.includes("unsuspended") ||
    action.includes("reactivated") ||
    action.includes("published")
  ) return "create";

  if (
    action.includes("archived") ||
    action.includes("deleted") ||
    action.includes("removed") ||
    action.includes("suspended") ||
    action.includes("deactivated") ||
    action.includes("revoked") ||
    action.includes("force_logout") ||
    action.includes("canceled") ||
    action.includes("discarded") ||
    action.includes("benched") ||
    action.includes("terminated")
  ) return "delete";

  if (
    action.includes("impersonation") ||
    action === "role.changed"
  ) return "warning";

  return "update";
}

export function severityColor(severity: ActionSeverity): { bg: string; fg: string } {
  switch (severity) {
    case "create": return { bg: "var(--color-success-bg, #f0fdf4)", fg: "var(--color-success, #16a34a)" };
    case "delete": return { bg: "var(--color-danger-bg, #fde8e8)", fg: "var(--color-danger)" };
    case "warning": return { bg: "var(--color-warning-bg, #fff8e6)", fg: "var(--color-warning, #b08800)" };
    case "update": return { bg: "var(--color-bg-secondary)", fg: "var(--color-text-secondary)" };
  }
}

// ---------------------------------------------------------------------------
// Human-readable descriptions
// ---------------------------------------------------------------------------

function nameFromDetails(details: Record<string, unknown>): string {
  const first = details.firstName ?? details.first_name;
  const last = details.lastName ?? details.last_name;
  if (first && last) return `${first} ${last}`;
  if (details.name) return String(details.name);
  if (details.email) return String(details.email);
  return "";
}

function titleCase(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function friendlyLabel(key: string): string {
  const labels: Record<string, string> = {
    actorEmail: "Actor",
    actor_email: "Actor",
    deactivate: "Status change",
    email: "Email",
    fromRole: "Previous role",
    from_role: "Previous role",
    initiated_by: "Initiated by",
    justification: "Justification",
    name: "Name",
    newRole: "New role",
    new_role: "New role",
    note: "Note",
    orgRole: "Organization role",
    reason: "Reason",
    role: "Role",
    startDate: "Start date",
    start_date: "Start date",
    endDate: "End date",
    end_date: "End date",
    targetEmail: "Target",
    target_email: "Target",
    targetName: "Target",
    targetOrgId: "Organization",
    targetUserId: "User",
    toRole: "New role",
    to_role: "New role",
  };
  return labels[key] ?? titleCase(key);
}

function friendlyValue(key: string, value: unknown): string {
  if (typeof value === "boolean") {
    if (key === "deactivate") return value ? "Deactivate account" : "Reactivate account";
    return value ? "Yes" : "No";
  }
  if (value instanceof Date) {
    return value.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  if (typeof value === "string") {
    const normalizedKey = key.toLowerCase();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return formatShortDate(value);
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
      }
    }
    if (
      normalizedKey.includes("role") ||
      normalizedKey === "initiated_by" ||
      normalizedKey === "status" ||
      normalizedKey === "type" ||
      normalizedKey.endsWith("_type") ||
      normalizedKey.endsWith("type")
    ) {
      return titleCase(value);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => friendlyValue(key, item)).join(", ");
  }
  return String(value);
}

export function describeAction(entry: FullAuditLogEntry): string {
  const { action, details } = entry;
  const name = nameFromDetails(details);

  switch (action) {
    // Employee
    case "employee.created": return name ? `Added employee ${name}` : "Added a new employee";
    case "employee.updated": return name ? `Updated employee ${name}` : "Updated an employee";
    case "employee.archived": return name ? `Terminated employee ${name}` : "Terminated an employee";
    case "employee.benched": {
      const note = details.note ? ` — ${details.note}` : "";
      return `Benched employee${name ? ` ${name}` : ""}${note}`;
    }
    case "employee.activated": return name ? `Activated employee ${name}` : "Activated an employee";

    // Shifts
    case "shift.created": return "Created a shift";
    case "shift.updated": return "Updated a shift";
    case "shift.deleted": return "Deleted a shift";
    case "shift.moved": {
      const target = details.targetDate ? ` to ${formatShortDate(String(details.targetDate))}` : "";
      return `Moved a shift${target}`;
    }

    // Schedule
    case "schedule.published": {
      const start = details.startDate ? formatShortDate(String(details.startDate)) : "";
      const end = details.endDate ? formatShortDate(String(details.endDate)) : "";
      return start && end ? `Published schedule ${start} – ${end}` : "Published the schedule";
    }
    case "schedule.drafts_discarded": return "Discarded schedule drafts";

    // Shift requests
    case "shift_request.created": return "Created a shift request";
    case "shift_request.claimed": return "Claimed a shift request";
    case "shift_request.responded": return "Responded to a shift request";
    case "shift_request.resolved": return "Resolved a shift request";
    case "shift_request.canceled": return "Canceled a shift request";

    // Organization
    case "org.updated": return name ? `Updated organization ${name}` : "Updated organization settings";
    case "org.created": return name ? `Created organization ${name}` : "Created a new organization";
    case "org.archived": return "Archived the organization";
    case "org.restored": return "Restored the organization";
    case "org.suspended": {
      const reason = details.reason ? ` — ${details.reason}` : "";
      return `Suspended the organization${reason}`;
    }
    case "org.unsuspended": return "Unsuspended the organization";
    case "org.deleted": return "Deleted the organization";

    // Access & Roles
    case "role.changed": {
      const newRole = details.newRole ?? details.new_role;
      const target = details.targetEmail ? ` for ${details.targetEmail}` : "";
      return newRole ? `Changed role to ${titleCase(String(newRole))}${target}` : `Changed a user's role${target}`;
    }
    case "permissions.updated": {
      const target = details.targetEmail ? ` for ${details.targetEmail}` : "";
      return `Updated admin permissions${target}`;
    }
    case "user.removed_from_org": return "Removed a user from the organization";
    case "user.deactivated": return "Deactivated a user";
    case "user.reactivated": return "Reactivated a user";
    case "user.force_logout": return "Force-logged out a user";
    case "user.password_reset_sent": return "Sent a password reset";

    // Invitations
    case "invitation.sent": {
      const email = details.email ? String(details.email) : "";
      const role = details.role ? ` as ${titleCase(String(details.role))}` : "";
      return email ? `Invited ${email}${role}` : "Sent an invitation";
    }
    case "invitation.accepted": return details.email ? `${details.email} accepted their invitation` : "An invitation was accepted";
    case "invitation.revoked": return "Revoked an invitation";
    case "invitation.resent": return "Resent an invitation";

    // Config items
    case "focus_area.upserted": return name ? `Updated focus area "${name}"` : "Updated a focus area";
    case "focus_area.archived": return "Archived a focus area";
    case "focus_area.restored": return "Restored a focus area";
    case "assignment.upserted": return name ? `Updated schedule option "${name}"` : "Updated a schedule option";
    case "assignment.archived": return "Archived a schedule option";
    case "assignment.restored": return "Restored a schedule option";
    case "absence_type.upserted": return name ? `Updated absence type "${name}"` : "Updated an absence type";
    case "absence_type.archived": return "Archived an absence type";
    case "absence_type.restored": return "Restored an absence type";
    case "shift_category.upserted": return name ? `Updated shift "${name}"` : "Updated a shift";
    case "shift_category.archived": return "Archived a shift";
    case "shift_category.restored": return "Restored a shift";
    case "job.upserted": return name ? `Updated job "${name}"` : "Updated a job";
    case "job.archived": return "Archived a job";
    case "job.restored": return "Restored a job";
    case "indicator_type.upserted": return name ? `Updated indicator type "${name}"` : "Updated an indicator type";
    case "indicator_type.archived": return "Archived an indicator type";
    case "indicator_type.restored": return "Restored an indicator type";
    case "certifications.saved": return "Updated certifications";
    case "org_roles.saved": return "Updated organization roles";
    case "coverage_requirements.saved": return "Updated coverage requirements";
    case "coverage_rule_config.saved": return "Updated coverage rule settings";

    // Recurring
    case "recurring_shift.upserted": return "Updated a recurring shift";
    case "recurring_shift.deleted": return "Deleted a recurring shift";
    case "recurring_schedule.applied": return "Applied the recurring schedule";
    case "shift_series.created": return "Created a shift series";
    case "shift_series.updated": return "Updated a shift series";
    case "shift_series.archived": return "Archived a shift series";

    // Impersonation
    case "impersonation.started": {
      const justification = details.justification ? ` — ${details.justification}` : "";
      return `Started impersonation session${justification}`;
    }
    case "impersonation.ended": return "Ended impersonation session";

    // Notes
    case "schedule_note.upserted": return "Updated a schedule note";
    case "schedule_note.deleted": return "Deleted a schedule note";

    // Billing
    case "billing.subscription_created": return "Started subscription";
    case "billing.subscription_updated": return "Updated subscription";
    case "billing.subscription_cancel_scheduled": return "Scheduled subscription cancellation";
    case "billing.trial_extended": return "Extended trial period";
    case "billing.subscription_canceled": return "Canceled subscription";
    case "billing.payment_failed": return "Recorded a failed payment";
    case "billing.payment_succeeded": return "Recorded a successful payment";
    case "billing.payment_method_updated": return "Updated payment method";
    case "billing.billing_details_updated": return "Updated billing details";
    case "billing.portal_opened": return "Opened billing portal";
    case "billing.seats_synced": return "Synced billing seats";
    case "billing.status_overridden": return "Overrode billing status";
    case "billing.synced": return "Synced billing data";

    // Data export
    case "data.exported": return "Exported data";
    case "data.portability_exported": return "Exported privacy data";

    default: return titleCase(action);
  }
}

export function describeAuditEvent(
  action: string,
  details: Record<string, unknown> = {},
): string {
  return describeAction({ action, details } as FullAuditLogEntry);
}

// ---------------------------------------------------------------------------
// Relative time formatting
// ---------------------------------------------------------------------------

export function formatRelativeTime(isoString: string): string {
  const now = new Date();
  const d = new Date(isoString);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${formatTime(d)}`;
  }

  const sixDaysAgo = new Date(now);
  sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
  if (d >= sixDaysAgo) {
    return `${d.toLocaleDateString(undefined, { weekday: "long" })} at ${formatTime(d)}`;
  }

  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined })} at ${formatTime(d)}`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00"));
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

  const groups: Map<string, { label: string; entries: FullAuditLogEntry[] }> = new Map();

  for (const entry of entries) {
    const d = new Date(entry.createdAt);
    const dateStr = d.toDateString();

    let label: string;
    if (dateStr === todayStr) label = "Today";
    else if (dateStr === yesterdayStr) label = "Yesterday";
    else label = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });

    const existing = groups.get(dateStr);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.set(dateStr, { label, entries: [entry] });
    }
  }

  return Array.from(groups.values());
}

// ---------------------------------------------------------------------------
// Detail formatting
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean { return UUID_RE.test(s); }
function isIdKey(key: string): boolean {
  const k = key.toLowerCase();
  return k.endsWith("id") || k.endsWith("ids") || k === "id";
}

export interface DetailItem {
  label: string;
  value: string;
}

export function formatDetails(entry: FullAuditLogEntry): DetailItem[] {
  const { action, details } = entry;
  if (!details || Object.keys(details).length === 0) return [];

  // Actions whose details are already fully captured in the description — skip
  // to avoid redundant display (e.g. "Published schedule Mar 29 – Apr 11"
  // already contains the start/end dates).
  const DESCRIBED_ACTIONS = new Set([
    "schedule.published",       // dates in description
    "invitation.sent",          // email + role in description
    "employee.created",         // name in description
    "employee.updated",         // name in description
    "employee.archived",        // name in description
    "employee.benched",         // name + note in description
    "employee.activated",       // name in description
    "org.updated",              // name in description
    "org.created",              // name in description
    "org.suspended",            // reason in description
    "role.changed",             // new role + target email in description
    "invitation.accepted",      // email in description
    "impersonation.started",    // justification in description
    "shift.moved",              // target date in description
    "focus_area.upserted",      // name in description
    "assignment.upserted",      // name in description
    "absence_type.upserted",    // name in description
    "shift_category.upserted",  // name in description
    "indicator_type.upserted",  // name in description
  ]);
  if (DESCRIBED_ACTIONS.has(action)) return [];

  const items: DetailItem[] = [];

  if (action === "role.changed") {
    const fromRole = details.fromRole ?? details.from_role;
    const toRole = details.toRole ?? details.to_role ?? details.newRole ?? details.new_role;
    if (fromRole && toRole) {
      return [
        {
          label: "Role change",
          value: `${friendlyValue("role", fromRole)} to ${friendlyValue("role", toRole)}`,
        },
      ];
    }
  }

  // Action-specific formatting for actions with extra data worth showing
  if (action === "permissions.updated" && details.permissions) {
    const perms = details.permissions as Record<string, boolean>;
    const enabled = Object.entries(perms).filter(([, v]) => v).map(([k]) => friendlyLabel(k));
    const disabled = Object.entries(perms).filter(([, v]) => !v).map(([k]) => friendlyLabel(k));
    if (enabled.length) items.push({ label: "Enabled", value: enabled.join(", ") });
    if (disabled.length) items.push({ label: "Disabled", value: disabled.join(", ") });
    return items;
  }

  // Generic fallback: show all values, but skip raw IDs (UUIDs, arrays of UUIDs)
  for (const [key, val] of Object.entries(details)) {
    if (val === null || val === undefined) continue;
    if (key === "initiated_by") continue;
    // Skip keys that are raw IDs — not useful to display
    if (isIdKey(key)) continue;
    if (Array.isArray(val)) {
      // Skip arrays of UUIDs (e.g. assignmentIds)
      if (val.length > 0 && val.every((v) => isUuid(String(v)))) continue;
      items.push({ label: friendlyLabel(key), value: friendlyValue(key, val) });
    } else if (typeof val === "object") {
      for (const [subKey, subVal] of Object.entries(val as Record<string, unknown>)) {
        if (subVal === null || subVal === undefined) continue;
        if (isIdKey(subKey)) continue;
        items.push({ label: friendlyLabel(`${key} ${subKey}`), value: friendlyValue(subKey, subVal) });
      }
    } else {
      // Skip individual UUID values
      if (isUuid(String(val))) continue;
      items.push({ label: friendlyLabel(key), value: friendlyValue(key, val) });
    }
  }

  return items;
}

/**
 * Produce a compact inline summary of details for display in a table cell.
 * Shows the most important 2-3 key-value pairs as "Key: Value" fragments.
 */
export function summarizeDetails(entry: FullAuditLogEntry): string {
  const items = formatDetails(entry);
  if (items.length === 0) return "—";
  return items.map((i) => `${i.label}: ${i.value}`).join(" · ");
}

export function getAuditActorLabel(entry: FullAuditLogEntry): string {
  const initiatedBy = entry.details?.initiated_by;
  if (initiatedBy === "gridmaster" || initiatedBy === "gridmaster_sync") {
    return "Gridmaster";
  }
  return entry.actorName ?? entry.actorEmail ?? "System";
}

export function getAuditActorSecondaryLabel(entry: FullAuditLogEntry): string | null {
  if (getAuditActorLabel(entry) === "Gridmaster") return null;
  return entry.actorName ? entry.actorEmail : null;
}

export function getAuditTargetLabel(entry: FullAuditLogEntry): string {
  return entry.targetLabel ?? titleCase(entry.resourceType);
}

// ---------------------------------------------------------------------------
// Search matching
// ---------------------------------------------------------------------------

export function matchesSearch(entry: FullAuditLogEntry, query: string, description: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    description.toLowerCase().includes(q) ||
    (entry.actorName ?? "").toLowerCase().includes(q) ||
    (entry.actorEmail ?? "").toLowerCase().includes(q) ||
    (entry.targetLabel ?? "").toLowerCase().includes(q) ||
    (entry.targetEmail ?? "").toLowerCase().includes(q) ||
    entry.action.toLowerCase().includes(q) ||
    entry.resourceType.toLowerCase().includes(q)
  );
}
