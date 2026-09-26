/**
 * The single vocabulary for audit-log activity.
 *
 * Before this existed there were four partial, disagreeing tables: a
 * `describeAction` switch, an `ACTION_LABELS` map, a `RESOURCE_TYPE_LABELS`
 * map, and an `ACTIVITY_CATEGORIES` prefix list. Anything missing from one of
 * them fell through to title-casing the raw action key, which printed database
 * identifiers back at the customer ("Gridmaster Account Promoted", "Org Role
 * Restored"). Every view now reads from here instead, and
 * `audit-registry.test.ts` fails when an action is written without an entry.
 *
 * Adding a new audited action means adding a spec here in the same change.
 */

import {
  AuditDetails,
  type DetailItem,
  formatDateRange,
  formatMinorUnits,
  formatScalar,
  formatShortDate,
  formatValue,
  friendlyLabel,
  pluralize,
  titleCase,
} from "./details";
import { formatBillingStatusLabel } from "@/lib/client-facing";
import { diffPermissions, permissionLabel } from "@/lib/permission-labels";
import type { Audience } from "@dubgrid/domain";

// ── Categories ───────────────────────────────────────────────────────────────

export const AUDIT_CATEGORY_LABELS = {
  people: "People",
  schedule: "Schedule",
  requests: "Shift requests",
  access: "Access & roles",
  invitations: "Invitations",
  setup: "Setup",
  recurring: "Recurring shifts",
  organization: "Organization",
  impersonation: "Impersonation",
  billing: "Billing",
  data: "Data & privacy",
  security: "Security",
  platform: "Platform",
} as const;

export type AuditCategory = keyof typeof AUDIT_CATEGORY_LABELS;

/** Drives the severity dot / badge tint. Unchanged from the previous behavior. */
export type ActionSeverity = "create" | "update" | "delete" | "warning";

// ── Spec shape ───────────────────────────────────────────────────────────────

/**
 * What the view knows about an entry beyond its details blob. The API resolves
 * `targetLabel` from the real record (employee, invitation, organization), so a
 * headline can name a person without the spec touching an id.
 */
export interface AuditContext {
  targetLabel: string | null;
  targetEmail: string | null;
  orgName: string | null;
  resourceId: string | null;
  resourceType: string;
}

export interface AuditActionSpec {
  category: AuditCategory;
  severity: ActionSeverity;
  /** Plain-English sentence. Never contains an id, enum token, or column name. */
  headline: (d: AuditDetails, ctx: AuditContext) => string;
  /**
   * Detail rows for the table and the modal. Omit anything the headline already
   * says. When absent, the generic safe flattener renders the blob instead —
   * which is the right answer whenever the payload is plain key/values.
   */
  details?: (d: AuditDetails, ctx: AuditContext) => DetailItem[];
  /**
   * Detail keys the headline already spells out, so the flattener doesn't
   * repeat them underneath. Only consulted when `details` is absent — a spec
   * that renders its own rows is already deciding what to show.
   */
  suppressKeys?: readonly string[];
  /**
   * Who may read the row. Omitted means `org`: the organization's own admins
   * see it, and so do gridmasters. `platform` keeps tooling (impersonation,
   * feature flags, sign-in evidence, gridmaster billing operations) out of the
   * organization's own log.
   */
  audience?: Audience;
}

/**
 * Identity keys every entry may carry. The Who and Target columns already show
 * this, so no detail row ever needs to repeat it.
 */
export const ALWAYS_SUPPRESSED_DETAIL_KEYS: ReadonlySet<string> = new Set([
  "email",
  "firstName",
  "first_name",
  "initiated_by",
  "lastName",
  "last_name",
  "name",
  "targetEmail",
  "targetName",
  "target_email",
  "target_first_name",
  "target_last_name",
  "targetFirstName",
  "targetLastName",
]);

const EMPTY_CONTEXT: AuditContext = {
  targetLabel: null,
  targetEmail: null,
  orgName: null,
  resourceId: null,
  resourceType: "",
};

// ── Shared phrase helpers ────────────────────────────────────────────────────

/** "Sarah Chen" when we resolved a name, otherwise a neutral noun. */
function who(d: AuditDetails, ctx: AuditContext, fallback: string): string {
  return d.personName() ?? ctx.targetLabel ?? ctx.targetEmail ?? fallback;
}

/** The name a config record was saved under, quoted, or a neutral noun. */
function named(d: AuditDetails, noun: string): string {
  const name = d.text("name", "label");
  return name ? `${noun} "${name}"` : `a ${noun}`;
}

/**
 * Schedule cells are stored as numeric ids (shift, job, absence type) with no
 * names attached, so the audit row genuinely cannot say "Day shift". Describe
 * the shape truthfully rather than inventing a label or dumping the snapshot.
 */
function describeScheduleCell(d: AuditDetails): string | null {
  const input = d.record("input");
  if (!input) return null;
  const kind = typeof input.kind === "string" ? input.kind : null;

  if (kind === "deleted") return "Cleared";
  if (kind === "absence") return "Time off";
  if (kind !== "worked") return null;

  const segments = Array.isArray(input.segments) ? input.segments : [];
  const start = typeof input.customStartTime === "string" ? input.customStartTime : null;
  const end = typeof input.customEndTime === "string" ? input.customEndTime : null;

  const parts: string[] = [];
  parts.push(
    segments.length > 1 ? `Working, ${pluralize(segments.length, "assignment")}` : "Working",
  );
  if (start && end) parts.push(`${formatClockTime(start)} – ${formatClockTime(end)}`);
  return parts.join(", ");
}

/** "07:00:00" / "07:00" → "7:00 AM". Leaves anything unparseable alone. */
function formatClockTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isFinite(hours) || hours > 23) return value;
  const period = hours < 12 ? "AM" : "PM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${minutes} ${period}`;
}

/** The date half of a "<empId>:<date>" or "<empId>_<date>" resource id. */
function dateFromResourceId(ctx: AuditContext): string | null {
  if (!ctx.resourceId) return null;
  const match = /(\d{4}-\d{2}-\d{2})/.exec(ctx.resourceId);
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function onDate(ctx: AuditContext): string {
  const date = dateFromResourceId(ctx);
  return date ? ` on ${date}` : "";
}

/**
 * `saveNamedEntities` records `{ created, updated, archived }` as counts. The
 * old renderer showed "Created: 3 · Archived: 1" with no subject; say what was
 * counted and skip the zeroes.
 */
function summarizeSaveCounts(d: AuditDetails, noun: string): string {
  const created = d.count("created");
  const updated = d.count("updated");
  const archived = d.count("archived");

  const parts: string[] = [];
  if (created) parts.push(`${created} added`);
  if (updated) parts.push(`${updated} changed`);
  if (archived) parts.push(`${archived} removed`);

  if (parts.length === 0) return `Reviewed ${noun} without making changes`;
  return `Updated ${noun}: ${parts.join(", ")}`;
}

/** The `{ from, to }` record pair written by the settings + identity routes. */
function fieldDiffRows(d: AuditDetails): DetailItem[] {
  // These are lookup keys for `from`/`to`, so they must remain raw (for
  // example `focusAreas`) until after the corresponding values are read.
  const rawChangedFields = d.rawValue("changedFields");
  const changedFields = Array.isArray(rawChangedFields)
    ? rawChangedFields.filter(
        (field): field is string => typeof field === "string" && field.trim().length > 0,
      )
    : [];
  if (changedFields.length === 0) return [];

  const from = d.record("from") ?? {};
  const to = d.record("to") ?? {};

  return changedFields.map((field) => {
    // Employee reference fields are deliberately stored as readable lists
    // (roles, departments, focus areas), not scalar ids.
    const before = formatValue(field, from[field]);
    const after = formatValue(field, to[field]);
    const label = friendlyLabel(field);
    if (before && after) return { label, value: `${before} → ${after}` };
    if (after) return { label, value: `Set to ${after}` };
    if (before) return { label, value: `Cleared (was ${before})` };
    return { label, value: "Updated" };
  });
}

/** Rows from the `{ field, label, from, to }` change array. */
function changeRows(d: AuditDetails): DetailItem[] {
  return d.changes().flatMap((change) => {
    const label = change.label?.trim() || friendlyLabel(change.field);
    const permissionRows = permissionChangeRows(label, change.from, change.to);
    if (permissionRows) return permissionRows;
    const before = formatScalar(change.field, change.from);
    const after = formatScalar(change.field, change.to);
    if (before && after) return [{ label, value: `${before} → ${after}` }];
    if (after) return [{ label, value: `Set to ${after}` }];
    if (before) return [{ label, value: `Cleared (was ${before})` }];
    return [{ label, value: "Updated" }];
  });
}

/**
 * A change whose sides are permission maps reads as the flags that flipped.
 * "Updated" is the one thing an access audit row must never say, and a first
 * grant (no previous map) lists only what it allowed.
 */
function permissionChangeRows(label: string, from: unknown, to: unknown): DetailItem[] | null {
  const fromMap = permissionMap(from);
  const toMap = permissionMap(to);
  if (fromMap === undefined || toMap === undefined) return null;
  if (!fromMap && !toMap) return null;

  const diff = diffPermissions(fromMap, toMap);
  const allowed = Object.keys(diff)
    .filter((key) => diff[key])
    .map(permissionLabel);
  const revoked = Object.keys(diff)
    .filter((key) => !diff[key])
    .map(permissionLabel);
  const rows: DetailItem[] = [];
  if (allowed.length) rows.push({ label: "Allowed", value: allowed.join(", ") });
  if (revoked.length) rows.push({ label: "Not allowed", value: revoked.join(", ") });
  return rows.length ? rows : [{ label, value: "No effective change" }];
}

/** A boolean-valued record, `null` for an absent side, `undefined` for anything else. */
function permissionMap(value: unknown): Record<string, boolean> | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || !entries.every(([, v]) => typeof v === "boolean")) return undefined;
  return value as Record<string, boolean>;
}

/** Draft breakdown counts recorded on publish and discard. */
function draftSummaryRows(d: AuditDetails, key = "summary"): DetailItem[] {
  const summary = d.record(key);
  if (!summary) return [];
  const rows: DetailItem[] = [];
  const add = (field: string, label: string) => {
    const value = summary[field];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      rows.push({ label, value: String(value) });
    }
  };
  add("newShifts", "New shifts");
  add("modifiedShifts", "Changed shifts");
  add("deletedShifts", "Removed shifts");
  add("newNotes", "New notes");
  add("deletedNotes", "Removed notes");
  return rows;
}

// ── Config-record specs ──────────────────────────────────────────────────────

/**
 * Every configurable list (focus areas, shifts, jobs, absence types, indicators)
 * is audited with the same four verbs against the same payload, so the specs are
 * generated rather than written out five times.
 */
function configRecordSpecs(
  prefix: string,
  noun: string,
  overrides: { category?: AuditCategory } = {},
): Record<string, AuditActionSpec> {
  const category = overrides.category ?? "setup";
  return {
    [`${prefix}.upserted`]: {
      category,
      severity: "update",
      headline: (d) => `Saved ${named(d, noun)}`,
    },
    [`${prefix}.archived`]: {
      category,
      severity: "delete",
      headline: (d) => `Removed ${named(d, noun)}`,
    },
    [`${prefix}.deleted`]: {
      category,
      severity: "delete",
      headline: (d) => `Deleted ${named(d, noun)}`,
    },
    [`${prefix}.restored`]: {
      category,
      severity: "create",
      headline: (d) => `Restored ${named(d, noun)}`,
    },
  };
}

// ── The registry ─────────────────────────────────────────────────────────────

const SECURITY_REJECTION_REASONS: Record<string, string> = {
  invalid_credentials: "wrong password",
  policy_denied: "not allowed",
  rate_limited: "too many attempts",
  service_unavailable: "service unavailable",
  organization_unavailable: "organization unavailable",
  organization_access_denied: "no access to this organization",
  gridmaster_portal_required: "Gridmaster accounts sign in through the platform portal",
};

/** Sign-in style events read as outcome first; a rejection names why. */
function securityHeadline(d: AuditDetails, succeeded: string, noun: string): string {
  const outcome = d.text("outcome");
  const surface = d.text("surface") === "mobile" ? " from the mobile app" : "";
  if (outcome === "succeeded") return `${succeeded}${surface}`;
  const reason = d.text("reason");
  if (outcome === "challenged") {
    const awaiting = reason === "email_unconfirmed" ? "email confirmation" : "two-factor code";
    return `${noun} awaiting ${awaiting}${surface}`;
  }
  // Own keys only: audit rows can be written by any signed-in user, so a
  // reason such as "constructor" must not reach the prototype.
  const why =
    reason && Object.hasOwn(SECURITY_REJECTION_REASONS, reason)
      ? SECURITY_REJECTION_REASONS[reason]
      : null;
  const verb = outcome === "throttled" ? "throttled" : outcome === "failed" ? "failed" : "rejected";
  return `${noun} ${verb}${surface}${why ? `: ${why}` : ""}`;
}

/** Seats and status for a subscription row; a change reads "previous -> new". */
function subscriptionRows(d: AuditDetails): DetailItem[] {
  const rows: DetailItem[] = [];
  const seats = d.number("quantity");
  const previousSeats = d.number("previous_quantity");
  if (seats !== null) {
    rows.push({
      label: "Seats",
      value:
        previousSeats !== null && previousSeats !== seats
          ? `${previousSeats} -> ${seats}`
          : String(seats),
    });
  }
  const status = d.text("status");
  const previousStatus = d.text("previous_status");
  if (status) {
    rows.push({
      label: "Status",
      value:
        previousStatus && previousStatus !== status
          ? `${formatBillingStatusLabel(previousStatus)} -> ${formatBillingStatusLabel(status)}`
          : formatBillingStatusLabel(status),
    });
  }
  const renewsOn = d.text("current_period_end");
  if (renewsOn) rows.push({ label: "Current period ends", value: formatShortDate(renewsOn) });
  return rows;
}

/** The invoice amount in the customer's currency; Stripe records minor units. */
function amountRows(d: AuditDetails, key: string): DetailItem[] {
  const amount = d.number(key);
  const currency = d.text("currency");
  if (amount === null || !currency) return [];
  return [{ label: "Amount", value: formatMinorUnits(amount, currency) }];
}

export const AUDIT_ACTIONS: Record<string, AuditActionSpec> = {
  // ── People ─────────────────────────────────────────────────────────────────
  "employee.created": {
    category: "people",
    severity: "create",
    headline: (d, ctx) => `Added ${who(d, ctx, "a new team member")}`,
  },
  "employee.updated": {
    category: "people",
    severity: "update",
    headline: (d, ctx) => `Updated ${who(d, ctx, "a team member")}'s details`,
    details: (d) => fieldDiffRows(d),
  },
  "employee.deactivated": {
    category: "people",
    severity: "delete",
    headline: (d, ctx) => {
      const note = d.text("note");
      return `Marked ${who(d, ctx, "a team member")} inactive${note ? `: ${note}` : ""}`;
    },
    suppressKeys: ["note"],
  },
  "employee.activated": {
    category: "people",
    severity: "create",
    headline: (d, ctx) => `Marked ${who(d, ctx, "a team member")} active`,
  },
  "employee.removed": {
    category: "people",
    severity: "delete",
    headline: (d, ctx) => `Removed ${who(d, ctx, "a team member")}`,
  },
  // Historical keys from before the bench→deactivate / terminate→remove rename.
  // Old rows still carry them, so they render with the current copy.
  "employee.benched": {
    category: "people",
    severity: "delete",
    headline: (d, ctx) => {
      const note = d.text("note");
      return `Marked ${who(d, ctx, "a team member")} inactive${note ? `: ${note}` : ""}`;
    },
    suppressKeys: ["note"],
  },
  "employee.archived": {
    category: "people",
    severity: "delete",
    headline: (d, ctx) => `Removed ${who(d, ctx, "a team member")}`,
  },

  // ── Schedule ───────────────────────────────────────────────────────────────
  "shift.created": {
    category: "schedule",
    severity: "create",
    headline: (d, ctx) => `Added a shift${onDate(ctx)}`,
    details: (d) => {
      const cell = describeScheduleCell(d);
      return cell ? [{ label: "Shift", value: cell }] : [];
    },
  },
  "shift.updated": {
    category: "schedule",
    severity: "update",
    headline: (d, ctx) => `Changed a shift${onDate(ctx)}`,
    details: (d) => {
      const cell = describeScheduleCell(d);
      return cell ? [{ label: "Shift", value: cell }] : [];
    },
  },
  "shift.deleted": {
    category: "schedule",
    severity: "delete",
    headline: (_d, ctx) => `Removed a shift${onDate(ctx)}`,
  },
  "shift.moved": {
    category: "schedule",
    severity: "update",
    headline: (d, ctx) => {
      const target = d.date("targetDate");
      return `Moved a shift${onDate(ctx)}${target ? ` to ${target}` : ""}`;
    },
    details: (d) => {
      const cell = describeScheduleCell(d);
      return cell ? [{ label: "Shift", value: cell }] : [];
    },
  },
  "schedule.published": {
    category: "schedule",
    severity: "create",
    headline: (d) => {
      const start = d.isoDate("startDate");
      const end = d.isoDate("endDate");
      return start && end
        ? `Published the schedule for ${formatDateRange(start, end)}`
        : "Published the schedule";
    },
    details: (d) => draftSummaryRows(d),
  },
  "schedule.drafts_discarded": {
    category: "schedule",
    severity: "delete",
    headline: (d) =>
      d.text("scope") === "mine"
        ? "Discarded their own unsaved changes"
        : "Discarded unsaved schedule changes",
    details: (d) => draftSummaryRows(d),
  },
  "schedule_note.upserted": {
    category: "schedule",
    severity: "update",
    headline: (_d, ctx) => `Saved a schedule note${onDate(ctx)}`,
  },
  "schedule_note.deleted": {
    category: "schedule",
    severity: "delete",
    headline: (_d, ctx) => `Removed a schedule note${onDate(ctx)}`,
  },

  // ── Shift requests ─────────────────────────────────────────────────────────
  "shift_request.created": {
    category: "requests",
    severity: "create",
    headline: (d) => {
      const type = d.label("type");
      return type ? `Opened a ${type.toLowerCase()} request` : "Opened a shift request";
    },
    suppressKeys: ["type"],
  },
  "shift_request.claimed": {
    category: "requests",
    severity: "update",
    headline: () => "Claimed an open shift",
  },
  "shift_request.responded": {
    category: "requests",
    severity: "update",
    headline: (d) => {
      const accepted = d.bool("accept");
      if (accepted === null) return "Responded to a shift request";
      return accepted ? "Accepted a shift request" : "Declined a shift request";
    },
    suppressKeys: ["accept"],
  },
  "shift_request.resolved": {
    category: "requests",
    severity: "update",
    headline: (d) => {
      const approved = d.bool("approved");
      if (approved === null) return "Resolved a shift request";
      return approved ? "Approved a shift request" : "Denied a shift request";
    },
    suppressKeys: ["approved"],
  },
  "shift_request.canceled": {
    category: "requests",
    severity: "delete",
    headline: () => "Canceled a shift request",
  },

  // ── Access & roles ─────────────────────────────────────────────────────────
  "role.changed": {
    category: "access",
    severity: "warning",
    headline: (d, ctx) => {
      const target = who(d, ctx, "a team member");
      const to = d.label("toRole", "to_role", "newRole", "new_role");
      return to ? `Changed ${target}'s role to ${to}` : `Changed ${target}'s role`;
    },
    details: (d) => {
      const from = d.label("fromRole", "from_role");
      const to = d.label("toRole", "to_role", "newRole", "new_role");
      return from && to ? [{ label: "Role", value: `${from} → ${to}` }] : [];
    },
  },
  "role.assigned": {
    category: "access",
    severity: "warning",
    headline: (d, ctx) => {
      const target = who(d, ctx, "a team member");
      const role = d.label("role", "toRole", "to_role", "newRole", "new_role", "orgRole");
      return role ? `Gave ${target} the ${role} role` : `Assigned ${target} a role`;
    },
    suppressKeys: ["role", "toRole", "to_role", "newRole", "new_role", "orgRole"],
  },
  "permissions.updated": {
    category: "access",
    severity: "warning",
    headline: (d, ctx) => `Changed what ${who(d, ctx, "a team member")} can do`,
    details: (d) => {
      const permissions = d.record("permissions");
      if (!permissions) return [];
      const enabled: string[] = [];
      const disabled: string[] = [];
      for (const [key, value] of Object.entries(permissions)) {
        if (typeof value !== "boolean") continue;
        (value ? enabled : disabled).push(permissionLabel(key));
      }
      const rows: DetailItem[] = [];
      if (enabled.length) rows.push({ label: "Allowed", value: enabled.join(", ") });
      if (disabled.length) rows.push({ label: "Not allowed", value: disabled.join(", ") });
      return rows;
    },
  },
  "organization_access.updated": {
    category: "access",
    severity: "warning",
    headline: (d, ctx) => `Updated ${who(d, ctx, "a team member")}'s access`,
    details: (d) => changeRows(d),
  },
  "membership.updated": {
    category: "access",
    severity: "warning",
    headline: (d, ctx) => `Updated ${who(d, ctx, "a team member")}'s access`,
    details: (d) => changeRows(d),
  },
  "department_permissions.updated": {
    category: "access",
    severity: "warning",
    headline: () => "Changed what a department can do",
  },
  "user.removed_from_org": {
    category: "access",
    severity: "delete",
    headline: (d, ctx) => `Removed ${who(d, ctx, "a team member")} from the organization`,
  },
  "user.deactivated": {
    category: "access",
    severity: "delete",
    headline: (d, ctx) => `Deactivated ${who(d, ctx, "an account")}`,
  },
  "user.reactivated": {
    category: "access",
    severity: "create",
    headline: (d, ctx) => `Reactivated ${who(d, ctx, "an account")}`,
  },
  "user.terminated": {
    category: "access",
    severity: "delete",
    headline: (d, ctx) => `Terminated ${who(d, ctx, "an account")} platform-wide`,
  },
  "user.reinstated": {
    category: "access",
    severity: "create",
    headline: (d, ctx) => `Reinstated ${who(d, ctx, "an account")}`,
  },
  "user.force_logout": {
    category: "access",
    severity: "warning",
    headline: (d, ctx) => `Signed ${who(d, ctx, "a team member")} out of every device`,
  },
  "user.password_reset_sent": {
    category: "access",
    severity: "warning",
    headline: (d, ctx) => `Sent ${who(d, ctx, "a team member")} a password reset email`,
  },

  // ── Invitations ────────────────────────────────────────────────────────────
  "invitation.sent": {
    category: "invitations",
    severity: "create",
    headline: (d, ctx) => {
      const target = d.text("email") ?? ctx.targetEmail ?? ctx.targetLabel;
      const role = d.label("role", "roleToAssign");
      const suffix = role ? ` as ${role}` : "";
      return target ? `Invited ${target}${suffix}` : `Sent an invitation${suffix}`;
    },
    suppressKeys: ["role", "roleToAssign"],
  },
  "invitation.created": {
    category: "invitations",
    severity: "create",
    headline: (d, ctx) => {
      const target = d.text("email") ?? ctx.targetEmail ?? ctx.targetLabel;
      return target ? `Invited ${target}` : "Sent an invitation";
    },
    details: (d) => changeRows(d),
  },
  "invitation.updated": {
    category: "invitations",
    severity: "update",
    headline: (d, ctx) => {
      const target = d.text("email") ?? ctx.targetEmail ?? ctx.targetLabel;
      return target ? `Edited the invitation for ${target}` : "Edited an invitation";
    },
    details: (d) => changeRows(d),
  },
  "invitation.access_replaced": {
    category: "invitations",
    severity: "update",
    headline: (d, ctx) => {
      const target = d.text("email") ?? ctx.targetEmail ?? ctx.targetLabel;
      return target
        ? `Changed invitation access for ${target} and sent a replacement`
        : "Changed invitation access and sent a replacement";
    },
    details: (d) => changeRows(d),
  },
  "invitation.accepted": {
    category: "invitations",
    severity: "create",
    headline: (d, ctx) => {
      const target = d.text("email") ?? ctx.targetEmail ?? ctx.targetLabel;
      return target ? `${target} accepted their invitation` : "An invitation was accepted";
    },
  },
  "invitation.revoked": {
    category: "invitations",
    severity: "delete",
    headline: (d, ctx) => {
      const target = d.text("email") ?? ctx.targetEmail ?? ctx.targetLabel;
      return target ? `Canceled the invitation for ${target}` : "Canceled an invitation";
    },
  },
  "invitation.resent": {
    category: "invitations",
    severity: "update",
    headline: (d, ctx) => {
      const target = d.text("email") ?? ctx.targetEmail ?? ctx.targetLabel;
      return target ? `Resent the invitation to ${target}` : "Resent an invitation";
    },
  },

  "invitation.access_denied": {
    category: "invitations",
    severity: "warning",
    headline: (d, ctx) => {
      const target = d.text("email") ?? ctx.targetEmail ?? ctx.targetLabel;
      const role = d.text("requestedRole");
      const tier = role === "super_admin" ? "super admin" : role;
      if (!tier) return "Was refused an invitation change";
      return target
        ? `Was refused ${tier} access for ${target}`
        : `Was refused ${tier} access on an invitation`;
    },
  },

  "invitation.auto_revoked": {
    category: "invitations",
    severity: "warning",
    headline: (d) => {
      const email = d.text("invitation_email");
      return email
        ? `Withdrew the pending invitation for ${email} because the team member's email changed`
        : "Withdrew a pending invitation because the team member's email changed";
    },
    // The row carries the old and new email; the headline says what happened.
    details: () => [],
  },

  "invitation.expired": {
    category: "invitations",
    severity: "warning",
    headline: (d, ctx) => {
      const target = d.text("email") ?? ctx.targetEmail ?? ctx.targetLabel;
      return target ? `The invitation for ${target} expired` : "An invitation expired";
    },
  },

  // ── Setup: single records ──────────────────────────────────────────────────
  ...configRecordSpecs("focus_area", "focus area"),
  ...configRecordSpecs("assignment", "schedule option"),
  ...configRecordSpecs("absence_type", "time off type"),
  ...configRecordSpecs("shift_category", "shift"),
  ...configRecordSpecs("job", "job"),
  ...configRecordSpecs("indicator_type", "indicator"),

  // ── Setup: saved lists ─────────────────────────────────────────────────────
  "departments.saved": {
    category: "setup",
    severity: "update",
    headline: (d) => summarizeSaveCounts(d, "departments"),
    details: (d) => changeRows(d),
  },
  "department.restored": {
    category: "setup",
    severity: "create",
    headline: (d) => `Restored ${named(d, "department")}`,
  },
  "certifications.saved": {
    category: "setup",
    severity: "update",
    headline: (d) => summarizeSaveCounts(d, "certifications"),
    details: (d) => changeRows(d),
  },
  "certification.restored": {
    category: "setup",
    severity: "create",
    headline: (d) => `Restored ${named(d, "certification")}`,
  },
  "org_roles.saved": {
    category: "setup",
    severity: "update",
    headline: (d) => summarizeSaveCounts(d, "roles"),
    details: (d) => changeRows(d),
  },
  "org_role.restored": {
    category: "setup",
    severity: "create",
    headline: (d) => `Restored ${named(d, "role")}`,
  },
  "coverage_requirements.saved": {
    category: "setup",
    severity: "update",
    headline: (d) => {
      const count = d.number("count");
      if (count === null) return "Updated coverage requirements";
      return count === 0
        ? "Cleared a coverage requirement"
        : `Updated a coverage requirement to ${pluralize(count, "person", "people")}`;
    },
    suppressKeys: ["count"],
  },
  "coverage_rule_config.saved": {
    category: "setup",
    severity: "update",
    headline: () => "Updated the coverage rules",
  },

  // ── Recurring shifts ───────────────────────────────────────────────────────
  "recurring_shift.upserted": {
    category: "recurring",
    severity: "update",
    headline: () => "Saved a recurring shift",
  },
  "recurring_shift.deleted": {
    category: "recurring",
    severity: "delete",
    headline: () => "Removed a recurring shift",
  },
  "recurring_schedule.applied": {
    category: "recurring",
    severity: "create",
    headline: () => "Applied the recurring schedule",
  },
  "shift_series.created": {
    category: "recurring",
    severity: "create",
    headline: (d) => {
      const occurrences = d.number("occurrences");
      const start = d.isoDate("startDate");
      const end = d.isoDate("endDate");
      const span = start && end ? ` for ${formatDateRange(start, end)}` : "";
      return occurrences === null
        ? `Created a repeating shift${span}`
        : `Created a repeating shift${span}: ${pluralize(occurrences, "shift")}`;
    },
    details: (d) => {
      const rows: DetailItem[] = [];
      const cell = describeScheduleCell(d);
      if (cell) rows.push({ label: "Shift", value: cell });
      const frequency = d.label("frequency");
      if (frequency) rows.push({ label: "Repeats", value: frequency });
      return rows;
    },
  },
  "shift_series.updated": {
    category: "recurring",
    severity: "update",
    headline: () => "Changed every shift in a repeating series",
    details: (d) => {
      const cell = describeScheduleCell(d);
      return cell ? [{ label: "Changed to", value: cell }] : [];
    },
  },
  "shift_series.archived": {
    category: "recurring",
    severity: "delete",
    headline: (d) => {
      const affected = d.number("shiftsAffected");
      return affected === null
        ? "Removed a repeating shift"
        : `Removed a repeating shift: ${pluralize(affected, "shift")} cleared`;
    },
    suppressKeys: ["shiftsAffected"],
  },

  // ── Organization ───────────────────────────────────────────────────────────
  "org.created": {
    category: "organization",
    severity: "create",
    headline: (d, ctx) => {
      const name = d.text("name") ?? ctx.orgName;
      return name ? `Created the organization ${name}` : "Created a new organization";
    },
  },
  "org.updated": {
    category: "organization",
    severity: "update",
    headline: () => "Updated the organization settings",
    details: (d) => changeRows(d),
  },
  "org.archived": {
    category: "organization",
    severity: "delete",
    headline: () => "Archived the organization",
  },
  "org.restored": {
    category: "organization",
    severity: "create",
    headline: () => "Restored the organization",
  },
  "org.suspended": {
    category: "organization",
    severity: "delete",
    headline: (d) => {
      const reason = d.text("reason");
      return `Suspended the organization${reason ? ` — ${reason}` : ""}`;
    },
    suppressKeys: ["reason"],
  },
  "org.unsuspended": {
    category: "organization",
    severity: "create",
    headline: () => "Lifted the suspension on the organization",
  },
  "org.deleted": {
    category: "organization",
    severity: "delete",
    headline: (d, ctx) => {
      const name = d.text("name") ?? ctx.orgName;
      return name ? `Deleted the organization ${name}` : "Deleted the organization";
    },
  },
  // The delete route writes this spelling; older rows use "org.deleted".
  "organization.deleted": {
    category: "organization",
    severity: "delete",
    headline: (d, ctx) => {
      const name = d.text("name") ?? ctx.orgName;
      return name ? `Deleted the organization ${name}` : "Deleted the organization";
    },
  },
  "feature_flags.updated": {
    audience: "platform",
    category: "organization",
    severity: "warning",
    headline: () => "Changed which features are turned on",
    details: (d) => {
      const from = d.record("from") ?? {};
      const to = d.record("to") ?? {};
      const keys = [...new Set([...Object.keys(from), ...Object.keys(to)])];
      return keys
        .filter((key) => from[key] !== to[key])
        .map((key) => ({
          label: titleCase(key),
          value: to[key] ? "Turned on" : "Turned off",
        }));
    },
  },

  // ── Impersonation ──────────────────────────────────────────────────────────
  "impersonation.started": {
    audience: "platform",
    category: "impersonation",
    severity: "warning",
    headline: (d, ctx) => {
      const target = who(d, ctx, "a team member");
      const reason = d.text("justification");
      return `Started viewing the app as ${target}${reason ? ` — ${reason}` : ""}`;
    },
    suppressKeys: ["justification"],
  },
  "impersonation.ended": {
    audience: "platform",
    category: "impersonation",
    severity: "update",
    headline: (d) => {
      const reason = d.text("reason");
      return `Stopped viewing the app as another person${reason ? ` — ${reason}` : ""}`;
    },
    suppressKeys: ["reason"],
  },

  // ── Billing ────────────────────────────────────────────────────────────────
  "billing.subscription_created": {
    category: "billing",
    severity: "create",
    headline: () => "Started the subscription",
    details: (d) => subscriptionRows(d),
  },
  "billing.subscription_updated": {
    category: "billing",
    severity: "update",
    headline: () => "Updated the subscription",
    details: (d) => subscriptionRows(d),
  },
  "billing.subscription_cancel_scheduled": {
    category: "billing",
    severity: "warning",
    headline: () => "Scheduled the subscription to end",
    details: (d) => {
      const endsOn = d.text("cancel_at");
      return endsOn ? [{ label: "Ends on", value: formatShortDate(endsOn) }] : [];
    },
  },
  "billing.subscription_canceled": {
    category: "billing",
    severity: "delete",
    headline: () => "Canceled the subscription",
    details: () => [],
  },
  "billing.trial_extended": {
    audience: "platform",
    category: "billing",
    severity: "update",
    headline: () => "Extended the trial",
  },
  "billing.payment_failed": {
    category: "billing",
    severity: "delete",
    headline: () => "A payment didn't go through",
    details: (d) => amountRows(d, "amount_due"),
  },
  "billing.payment_succeeded": {
    category: "billing",
    severity: "create",
    headline: () => "A payment went through",
    details: (d) => amountRows(d, "amount_paid"),
  },
  "billing.payment_method_updated": {
    category: "billing",
    severity: "update",
    headline: () => "Updated the payment method",
    details: (d) => {
      const type = d.text("payment_method_type");
      return type ? [{ label: "Payment method", value: titleCase(type) }] : [];
    },
  },
  "billing.billing_details_updated": {
    category: "billing",
    severity: "update",
    headline: () => "Updated the billing details",
    details: () => [],
  },
  "billing.portal_opened": {
    audience: "platform",
    category: "billing",
    severity: "update",
    headline: () => "Opened the billing portal",
  },
  "billing.seats_synced": {
    audience: "platform",
    category: "billing",
    severity: "update",
    headline: (d) => {
      const seats = d.number("seats", "quantity");
      return seats === null
        ? "Updated the billed seat count"
        : `Updated the billed seat count to ${pluralize(seats, "seat")}`;
    },
    suppressKeys: ["seats", "quantity"],
  },
  "billing.status_overridden": {
    audience: "platform",
    category: "billing",
    severity: "warning",
    headline: () => "Overrode the billing status",
  },
  "billing.synced": {
    audience: "platform",
    category: "billing",
    severity: "update",
    headline: () => "Refreshed the billing details",
  },

  // ── Data & privacy ─────────────────────────────────────────────────────────
  "data.exported": {
    category: "data",
    severity: "warning",
    headline: (d) => {
      const type = d.label("type");
      return type ? `Exported ${type.toLowerCase()} data` : "Exported data";
    },
    suppressKeys: ["type"],
  },
  "data.portability_exported": {
    category: "data",
    severity: "warning",
    headline: () => "Downloaded a copy of their personal data",
  },
  "audit.exported": {
    audience: "platform",
    category: "data",
    severity: "warning",
    headline: (d) => {
      const rows = d.number("rowCount");
      return rows === null
        ? "Exported the activity log"
        : `Exported the activity log: ${pluralize(rows, "record")}`;
    },
    // The `filters` blob is the raw query, not something a reader needs.
    details: () => [],
  },
  "account.deleted": {
    category: "data",
    severity: "delete",
    headline: (d, ctx) => `Deleted the account for ${who(d, ctx, "a team member")}`,
  },
  "gdpr.erased": {
    category: "data",
    severity: "delete",
    headline: (d, ctx) => `Erased the personal data for ${who(d, ctx, "a team member")}`,
  },
  "account.deletion_started": {
    audience: "platform",
    category: "data",
    severity: "delete",
    headline: () => "Started deleting their own account",
    details: () => [],
  },
  "gdpr.erasure_started": {
    audience: "platform",
    category: "data",
    severity: "delete",
    headline: () => "Started erasing their own personal data",
    details: () => [],
  },

  // ── Security (platform-only evidence) ──────────────────────────────────────
  "security.auth.login": {
    audience: "platform",
    category: "security",
    severity: "update",
    headline: (d) => securityHeadline(d, "Signed in", "Sign-in"),
    details: () => [],
  },
  "security.auth.recovery": {
    audience: "platform",
    category: "security",
    severity: "warning",
    headline: (d) => securityHeadline(d, "Reset their password", "Password reset"),
    details: () => [],
  },
  "security.auth.mfa": {
    audience: "platform",
    category: "security",
    severity: "warning",
    headline: (d) => {
      const reason = d.text("reason");
      if (reason === "factor_enrollment_started")
        return "Started setting up two-factor authentication";
      if (reason === "factor_removed") return "Turned off two-factor authentication";
      if (reason === "reauthenticated") return "Confirmed their identity again";
      return securityHeadline(d, "Passed a two-factor check", "Two-factor check");
    },
    details: () => [],
  },
  "security.auth.session": {
    audience: "platform",
    category: "security",
    severity: "warning",
    headline: (d) => {
      const scope = d.text("scope");
      if (d.text("reason") === "password_changed") {
        return "Changed their password and signed out everywhere";
      }
      if (scope === "others") return "Signed out their other devices";
      if (scope === "global") return "Signed out everywhere";
      if (scope === "device") return "Signed out one of their devices";
      return "Signed out";
    },
    details: () => [],
  },

  // ── Platform (gridmaster) ──────────────────────────────────────────────────
  "gridmaster_account.promoted": {
    audience: "platform",
    category: "platform",
    severity: "warning",
    headline: (d, ctx) => `Gave ${who(d, ctx, "an account")} gridmaster access`,
  },
  "gridmaster_account.demoted": {
    audience: "platform",
    category: "platform",
    severity: "warning",
    headline: (d, ctx) => `Removed gridmaster access from ${who(d, ctx, "an account")}`,
  },
  "gridmaster_account.deactivated": {
    audience: "platform",
    category: "platform",
    severity: "delete",
    headline: (d, ctx) => `Deactivated the gridmaster account for ${who(d, ctx, "a teammate")}`,
  },
  "gridmaster_account.reactivated": {
    audience: "platform",
    category: "platform",
    severity: "create",
    headline: (d, ctx) => `Reactivated the gridmaster account for ${who(d, ctx, "a teammate")}`,
  },
  "platform_feature_flags.created": {
    audience: "platform",
    category: "platform",
    severity: "create",
    headline: (d) => {
      const key = d.text("key", "flagName");
      return key
        ? `Added the platform-wide control "${titleCase(key)}"`
        : "Added a platform-wide control";
    },
    suppressKeys: ["key", "flagName"],
  },
  "platform_feature_flags.updated": {
    audience: "platform",
    category: "platform",
    severity: "warning",
    headline: (d) => {
      const key = d.text("key", "flagName");
      return key
        ? `Changed the platform-wide control "${titleCase(key)}"`
        : "Changed a platform-wide control";
    },
    suppressKeys: ["key", "flagName"],
  },
};

// ── Lookups ──────────────────────────────────────────────────────────────────

export function getAuditActionSpec(action: string): AuditActionSpec | null {
  return AUDIT_ACTIONS[action] ?? null;
}

/**
 * Copy for an action we have no spec for. Reachable only for rows written by a
 * version of the app newer than this client, or by a call site that skipped the
 * registry (which `audit-registry.test.ts` is there to prevent).
 */
export function describeUnknownAction(action: string): string {
  const [, verb] = action.split(".");
  const subject = titleCase(action.split(".")[0] ?? action);
  if (!verb) return `${subject} activity`;
  return `${titleCase(verb)}: ${subject.toLowerCase()}`;
}

export function getAuditCategory(action: string): AuditCategory | null {
  return getAuditActionSpec(action)?.category ?? null;
}

export function getAuditCategoryLabel(action: string): string {
  const category = getAuditCategory(action);
  return category ? AUDIT_CATEGORY_LABELS[category] : "Other";
}

export function getAuditSeverity(action: string): ActionSeverity {
  return getAuditActionSpec(action)?.severity ?? "update";
}

export function describeAuditAction(
  action: string,
  details: Record<string, unknown>,
  context: Partial<AuditContext> = {},
): string {
  const spec = getAuditActionSpec(action);
  if (!spec) return describeUnknownAction(action);
  return spec.headline(new AuditDetails(details), { ...EMPTY_CONTEXT, ...context });
}

// ── Category options, derived ────────────────────────────────────────────────

export interface AuditCategoryOption {
  value: string;
  label: string;
  /**
   * Action prefixes belonging to this category. The activity log pushes the
   * filter to the server when a category maps to exactly one prefix; deriving
   * these means a new action can never land in a category nothing filters on.
   */
  prefixes: string[];
}

function buildCategoryOptions(): AuditCategoryOption[] {
  const prefixesByCategory = new Map<AuditCategory, Set<string>>();

  for (const [action, spec] of Object.entries(AUDIT_ACTIONS)) {
    const prefix = `${action.split(".")[0]}.`;
    const existing = prefixesByCategory.get(spec.category);
    if (existing) existing.add(prefix);
    else prefixesByCategory.set(spec.category, new Set([prefix]));
  }

  const options: AuditCategoryOption[] = [{ value: "all", label: "All activity", prefixes: [] }];
  for (const [value, label] of Object.entries(AUDIT_CATEGORY_LABELS)) {
    options.push({
      value,
      label,
      prefixes: [...(prefixesByCategory.get(value as AuditCategory) ?? [])].sort(),
    });
  }
  return options;
}

export const AUDIT_CATEGORY_OPTIONS: AuditCategoryOption[] = buildCategoryOptions();

/**
 * The categories a view can actually return, so its filter never offers an
 * option that can only ever come back empty.
 */
export function getAuditCategoryOptions(
  categories: readonly AuditCategory[],
): AuditCategoryOption[] {
  const allowed = new Set<string>(categories);
  return AUDIT_CATEGORY_OPTIONS.filter(
    (option) => option.value === "all" || allowed.has(option.value),
  );
}

/**
 * A person's activity holds only what happened to them. The employee activity
 * route filters its query to these same categories, so importing this rather
 * than repeating the list keeps the filter and the data in step.
 */
export const PERSON_ACTIVITY_CATEGORIES: readonly AuditCategory[] = [
  "people",
  "access",
  "invitations",
];

/**
 * Everything an organization's log can hold. Platform rows (gridmaster
 * accounts, platform feature flags) are written without an org id, so they
 * never reach an org-scoped query. Impersonation does carry the org it entered,
 * so it stays.
 */
export const ORG_ACTIVITY_CATEGORIES: readonly AuditCategory[] = (
  Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[]
).filter((category) => category !== "platform");

/**
 * Whether a row may be shown to an audience. An unregistered action has no
 * spec, so it is platform-only: the organization's log never shows copy the
 * registry did not write.
 */
export function isVisibleToAudience(action: string, audience: Audience): boolean {
  if (audience === "platform") return true;
  const spec = AUDIT_ACTIONS[action];
  return spec !== undefined && (spec.audience ?? "org") === "org";
}

/** Every action an organization's own admins may read, sorted for stable queries. */
export const ORG_AUDIENCE_ACTIONS: readonly string[] = Object.entries(AUDIT_ACTIONS)
  .filter(([, spec]) => (spec.audience ?? "org") === "org")
  .map(([action]) => action)
  .sort();

/** The categories with at least one org-visible action, in label order. */
export const ORG_AUDIENCE_CATEGORIES: readonly AuditCategory[] = (
  Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[]
).filter((category) =>
  ORG_AUDIENCE_ACTIONS.some((action) => AUDIT_ACTIONS[action]?.category === category),
);

export function matchesAuditCategory(action: string, categoryValue: string): boolean {
  if (categoryValue === "all") return true;
  return getAuditCategory(action) === categoryValue;
}

// ── Resource types ───────────────────────────────────────────────────────────

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  absence_type: "Time off type",
  assignment: "Schedule option",
  audit_log: "Activity log",
  billing: "Billing",
  certification: "Certification",
  coverage_requirement: "Coverage requirement",
  coverage_rule_config: "Coverage rules",
  data_export: "Data export",
  department: "Department",
  employee: "Team member",
  focus_area: "Focus area",
  impersonation_session: "Viewing session",
  indicator_type: "Indicator",
  invitation: "Invitation",
  job: "Job",
  org_role: "Role",
  organization: "Organization",
  organization_membership: "Organization access",
  permissions: "Permissions",
  recurring_shift: "Recurring shift",
  role: "Role",
  schedule: "Schedule",
  schedule_note: "Schedule note",
  shift: "Shift",
  shift_category: "Shift",
  shift_request: "Shift request",
  shift_series: "Repeating shift",
  user: "Account",
};

export function getResourceTypeLabel(resourceType: string): string {
  if (!resourceType) return "Record";
  return RESOURCE_TYPE_LABELS[resourceType] ?? titleCase(resourceType);
}

export const AUDIT_RESOURCE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Every record type" },
  ...Object.entries(RESOURCE_TYPE_LABELS)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label)),
];
