/**
 * Where tapping an alert takes the reader. An alert is one sentence about
 * something else (a request, a day on the schedule, a person, a bill), so the
 * destination is the point of tapping it, and both apps compute it here.
 */

export interface AlertDestination {
  /** A same-origin path; mobile maps it to a native route by prefix. */
  href: string;
  /** The verb for a button or an accessibility hint, e.g. "Open schedule". */
  label: string;
}

export interface AlertLike {
  type: string;
  metadata: Record<string, unknown> | null | undefined;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Platform rows for gridmasters; the portal shows their details instead. */
export const ALERT_TYPES_WITHOUT_DESTINATION: ReadonlySet<string> = new Set([
  "org_created",
  "org_trial_started",
  "org_archived",
  "org_restored",
  "org_subscription_converted",
  "org_subscription_canceled",
  "org_payment_failed",
]);

const SCHEDULE = { href: "/schedule", label: "Open schedule" };
const REQUESTS_MINE = { href: "/schedule?requests=mine", label: "Open requests" };
const PEOPLE = { href: "/people", label: "Open people" };
const PROFILE = { href: "/profile", label: "Open profile" };
const SECURITY = { href: "/profile?section=security", label: "Open security" };
const SETTINGS = { href: "/settings", label: "Open settings" };
const BILLING = { href: "/settings?section=org-billing", label: "Open billing" };

const FIXED_DESTINATIONS: Record<string, AlertDestination> = {
  shift_request_approved: REQUESTS_MINE,
  shift_request_rejected: REQUESTS_MINE,
  shift_request_expired: REQUESTS_MINE,
  recurring_shift_updated: SCHEDULE,
  shift_series_updated: SCHEDULE,
  recurring_schedules_applied: SCHEDULE,
  // An invited member is a row of the directory; there is no invitations page.
  invitation_accepted: PEOPLE,
  invitation_received: PEOPLE,
  invitation_resent: PEOPLE,
  invitation_revoked: PEOPLE,
  invitation_expired: PEOPLE,
  membership_removed: PEOPLE,
  admin_permissions_changed: PROFILE,
  member_dept_changed: PROFILE,
  system: PROFILE,
  org_settings_changed: SETTINGS,
  org_suspended: BILLING,
  org_unsuspended: BILLING,
  billing_subscription_changed: BILLING,
  billing_payment_failed: BILLING,
  billing_payment_succeeded: BILLING,
  billing_trial_ending_soon: BILLING,
  billing_trial_expired: BILLING,
  security_email_changed: SECURITY,
  security_password_changed: SECURITY,
  security_mfa_changed: SECURITY,
  security_new_device: SECURITY,
  security_session_revoked: SECURITY,
  impersonation_start: SECURITY,
  impersonation_end: SECURITY,
};

function text(metadata: AlertLike["metadata"], key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Only a plain same-origin path may be followed. The server writes
 * `actionUrl`, but a row is data, and `//host`, `https:`, or `javascript:`
 * must never become a link.
 */
function safePath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\s\\]/.test(value)) return null;
  return value;
}

function scheduleOn(date: string | null): AlertDestination {
  return date && DATE_KEY.test(date)
    ? { href: `/schedule?date=${date}`, label: SCHEDULE.label }
    : SCHEDULE;
}

function person(empId: string | null): AlertDestination {
  return empId && UUID.test(empId) ? { href: `/people/${empId}`, label: "Open person" } : PEOPLE;
}

export function resolveAlertDestination(alert: AlertLike): AlertDestination | null {
  const { type, metadata } = alert;

  const actionUrl = safePath(text(metadata, "actionUrl"));
  if (actionUrl) {
    return { href: actionUrl, label: text(metadata, "actionLabel") ?? "Open" };
  }

  switch (type) {
    case "shift_request_new":
      return text(metadata, "tab") === "approval"
        ? { href: "/schedule?requests=approval", label: "Open requests" }
        : REQUESTS_MINE;
    case "schedule_published":
      return scheduleOn(text(metadata, "startDate"));
    case "shift_change":
    case "schedule_note_published":
      return scheduleOn(text(metadata, "date"));
    case "employee_created":
    case "employee_status_changed":
    case "employee_profile_changed":
      return person(text(metadata, "empId"));
    default:
      return FIXED_DESTINATIONS[type] ?? null;
  }
}
