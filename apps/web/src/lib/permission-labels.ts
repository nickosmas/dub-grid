import { PERMISSION_MODULES } from "@dubgrid/authz";
import type { AdminPermissions } from "@/types";

// No editor row shows these: two are always on, one belongs to Super Admins.
const UNLISTED_PERMISSION_LABELS = {
  canViewSchedule: "Schedule: View",
  canViewStaff: "Staff: View",
  canManageOrgSettings: "Organization settings: Edit",
} as const;

function buildPermissionLabels(): Record<keyof AdminPermissions, string> {
  const labels: Partial<Record<keyof AdminPermissions, string>> = {
    ...UNLISTED_PERMISSION_LABELS,
  };
  for (const mod of PERMISSION_MODULES) {
    for (const key of mod.viewKeys) labels[key] = `${mod.title}: View`;
    for (const key of mod.editKeys) labels[key] = `${mod.title}: Edit`;
  }
  return labels as Record<keyof AdminPermissions, string>;
}

/**
 * Each admin permission flag named by the editor row and level that sets it
 * ("Staff: Edit"), so alerts, email and the activity log use the editor's words.
 * Several flags share a level, so lists of labels go through `uniqueLabels`.
 *
 * Its own module so both server code (notification copy) and the audit-log
 * registry can read it without pulling in `access-management.ts`, which types
 * itself against a React component.
 */
export const PERMISSION_LABELS = buildPermissionLabels();

export function uniqueLabels(labels: string[]): string[] {
  return [...new Set(labels)];
}

/** Keys migration 061 retired, still named in permission history written before it. */
const RETIRED_PERMISSION_LABELS: Record<string, string> = {
  canEditScheduleIndicators: PERMISSION_LABELS.canEditNotes,
};

export function permissionLabel(key: string): string {
  return PERMISSION_LABELS[key as keyof AdminPermissions] ?? RETIRED_PERMISSION_LABELS[key] ?? key;
}

/** Only the flags whose effective value flipped, keyed to their new value. */
export function diffPermissions(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Record<string, boolean> {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const diff: Record<string, boolean> = {};
  for (const key of keys) {
    const was = Boolean(before?.[key]);
    const is = Boolean(after?.[key]);
    if (was !== is) diff[key] = is;
  }
  return diff;
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

/** Every editor level a change turned on or off, by its label. */
export function listPermissionChanges(
  before: Record<string, boolean> | null | undefined,
  after: Record<string, boolean> | null | undefined,
): { granted: string[]; revoked: string[] } {
  const granted: string[] = [];
  const revoked: string[] = [];
  for (const [key, now] of Object.entries(diffPermissions(before, after))) {
    (now ? granted : revoked).push(permissionLabel(key));
  }
  return { granted: uniqueLabels(granted), revoked: uniqueLabels(revoked) };
}

/**
 * Describe what a permission change actually did, as a sentence fragment:
 * "turned on Publish schedule: Edit" / "turned off Staff: Edit".
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
  const { granted, revoked } = listPermissionChanges(before, after);
  if (granted.length === 0 && revoked.length === 0) return null;

  const parts: string[] = [];
  if (granted.length > 0) parts.push(`turned on ${summarizeList(granted)}`);
  if (revoked.length > 0) parts.push(`turned off ${summarizeList(revoked)}`);
  return parts.join(", and ");
}
