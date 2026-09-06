import type { AdminPermissions } from "@/types";

/**
 * Human names for the admin permission flags.
 *
 * Its own module so both server code (notification copy) and the audit-log
 * registry can read it without pulling in `access-management.ts`, which types
 * itself against a React component.
 */
export const PERMISSION_LABELS: Record<keyof AdminPermissions, string> = {
  canViewSchedule: "View schedule",
  canEditShifts: "Edit shifts",
  canPublishSchedule: "Publish schedule",
  canApplyRecurringSchedule: "Apply recurring schedule",
  canEditNotes: "Edit notes",
  canEditScheduleIndicators: "Edit schedule indicators",
  canViewRecurringShifts: "View recurring shifts",
  canManageRecurringShifts: "Manage recurring shifts",
  canManageShiftSeries: "Manage shift series",
  canViewStaff: "View staff",
  canViewEmployeeDetails: "View employee details",
  canManageEmployees: "Manage employees",
  canViewFocusAreas: "View focus areas",
  canManageFocusAreas: "Manage focus areas",
  canViewScheduleDefinitions: "View shifts and jobs",
  canManageScheduleDefinitions: "Manage shifts and jobs",
  canViewIndicatorTypes: "View indicator types",
  canManageIndicatorTypes: "Manage indicator types",
  canManageOrgSettings: "Manage organization settings",
  canViewOrgLabels: "View organization labels",
  canManageOrgLabels: "Manage organization labels",
  canViewCoverageRequirements: "View coverage requirements",
  canManageCoverageRequirements: "Manage coverage requirements",
  canApproveShiftRequests: "Approve shift requests",
  canViewDashboardAnalytics: "View dashboard analytics",
  canViewReports: "View reports",
};

export function permissionLabel(key: string): string {
  return PERMISSION_LABELS[key as keyof AdminPermissions] ?? key;
}

/** Lowercase form for mid-sentence use ("can now edit shifts"). */
function inSentence(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Past three names the sentence stops being readable in an inbox row. */
const MAX_LISTED_PERMISSIONS = 3;

function summarizeList(items: string[]): string {
  if (items.length <= MAX_LISTED_PERMISSIONS) return joinWithAnd(items);
  const shown = items.slice(0, MAX_LISTED_PERMISSIONS);
  const remaining = items.length - shown.length;
  return `${shown.join(", ")}, and ${remaining} more`;
}

/**
 * Describe what a permission change actually did, as a sentence fragment:
 * "gave you access to publish schedule" / "removed your access to edit shifts".
 * Returns null when nothing meaningful changed, so the caller can fall back.
 *
 * Only meant for a permission-only edit on someone who stays an admin. A role
 * change says what it needs to on its own; pairing it with a permission list
 * tells a freshly promoted user what they "lost".
 */
export function summarizePermissionChanges(
  before: Record<string, boolean> | null | undefined,
  after: Record<string, boolean> | null | undefined,
): string | null {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];

  const granted: string[] = [];
  const revoked: string[] = [];
  for (const key of keys) {
    const was = Boolean(before?.[key]);
    const now = Boolean(after?.[key]);
    if (was === now) continue;
    (now ? granted : revoked).push(inSentence(permissionLabel(key)));
  }

  if (granted.length === 0 && revoked.length === 0) return null;

  const parts: string[] = [];
  if (granted.length > 0) parts.push(`gave you access to ${summarizeList(granted)}`);
  if (revoked.length > 0) parts.push(`removed your access to ${summarizeList(revoked)}`);
  return parts.join(", and ");
}
