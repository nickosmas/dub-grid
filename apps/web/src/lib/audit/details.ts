/**
 * Safe formatting primitives for audit-log `details` payloads.
 *
 * Audit rows carry a free-form JSONB blob written by ~40 different call sites.
 * Nothing validates its shape, so the render path has to assume the worst:
 * nested objects, arrays of objects, raw UUIDs, NaN, ISO strings, enum keys.
 *
 * The rule this module enforces is that **no value reaches the screen unless we
 * can name it**. Anything we can't render as a scalar, a date, or a short list
 * is dropped rather than stringified — `String({})` is what produced
 * "[object Object]" in the activity log, and there is no formatting rule that
 * makes a raw snapshot readable to a customer anyway.
 */

export interface DetailItem {
  label: string;
  value: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T/;

/** How far into a nested object we're willing to descend for detail rows. */
const MAX_DEPTH = 2;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Keys whose values are database identifiers. Never useful to a customer, and
 * frequently a UUID, so they're dropped before formatting rather than after.
 */
export function isIdKey(key: string): boolean {
  const k = key.toLowerCase();
  return k === "id" || k.endsWith("id") || k.endsWith("ids");
}

export function titleCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatShortDate(value: string): string {
  const date = new Date(value + (value.includes("T") ? "" : "T00:00:00"));
  if (Number.isNaN(date.getTime())) return value;
  // The year is always spelled out: an audit row is a historical record, and
  // "May 4" is ambiguous the moment the log spans a year boundary.
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * "May 4 – May 17, 2026". Names the year once when both ends share it, so a
 * range doesn't read as two fully-qualified dates glued together.
 */
export function formatDateRange(start: string, end: string): string {
  const from = formatShortDate(start);
  const to = formatShortDate(end);
  if (from === to) return from;

  const startYear = start.slice(0, 4);
  const openEnd = startYear === end.slice(0, 4) ? from.replace(`, ${startYear}`, "") : from;
  return `${openEnd} \u2013 ${to}`;
}

/**
 * Turn "1 thing" / "2 things" without the "(s)" the copy guide bans.
 */
/** "$49.00" from Stripe's minor units; a currency Intl does not know falls back to "49.00 XYZ". */
export function formatMinorUnits(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const major = amount / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(major);
  } catch {
    return `${major.toFixed(2)} ${code}`;
  }
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

// ── Labels ───────────────────────────────────────────────────────────────────

const DETAIL_LABELS: Record<string, string> = {
  absenceTypeId: "Time off type",
  accept: "Response",
  actorEmail: "Actor",
  actor_email: "Actor",
  approved: "Decision",
  changedFields: "Changed",
  deactivate: "Status change",
  dragMode: "Move type",
  email: "Email",
  endDate: "End date",
  end_date: "End date",
  existingStatus: "Previous status",
  frequency: "Repeats",
  fromRole: "Previous role",
  from_role: "Previous role",
  initiated_by: "Initiated by",
  justification: "Reason",
  label: "Short code",
  name: "Name",
  newRole: "New role",
  new_role: "New role",
  note: "Note",
  occurrences: "Shifts created",
  orgRole: "Organization role",
  reason: "Reason",
  report: "Report",
  role: "Role",
  rowCount: "Records",
  scope: "Applied to",
  shiftsAffected: "Shifts affected",
  startDate: "Start date",
  start_date: "Start date",
  status: "Status",
  stripeCanceled: "Subscription canceled",
  targetDate: "Moved to",
  targetEmail: "Target",
  target_email: "Target",
  targetName: "Target",
  toRole: "New role",
  to_role: "New role",
  type: "Type",
};

const REPORT_LABELS: Record<string, string> = {
  "employee-directory": "Employee directory",
  "staff-hours": "Staff hours",
  "staff-activity": "Staff activity",
  "mentoring-hours": "Mentoring hours",
  "mentoring-detail": "Mentoring detail",
  coverage: "Coverage",
  "shift-period-summary": "Period summary",
  "shift-requests": "Shift requests",
  "absences-calloffs": "Absences and call-offs",
  "roster-status": "Roster status",
  "certification-role-matrix": "Certifications and roles",
  "account-access": "Account access",
  "schedule-matrix": "Schedule matrix",
};

export function friendlyLabel(key: string): string {
  return DETAIL_LABELS[key] ?? titleCase(key);
}

// ── Values ───────────────────────────────────────────────────────────────────

const BOOLEAN_LABELS: Record<string, [truthy: string, falsy: string]> = {
  accept: ["Accepted", "Declined"],
  approved: ["Approved", "Denied"],
  deactivate: ["Deactivate account", "Reactivate account"],
  fromRecurring: ["From a recurring shift", "Set manually"],
  isMentored: ["Mentored", "Not mentored"],
  stripeCanceled: ["Yes", "No"],
};

/**
 * Keys whose string values are enum/DB tokens and should read as words.
 */
function isEnumKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.includes("role") ||
    k === "initiated_by" ||
    k === "status" ||
    k === "scope" ||
    k === "kind" ||
    k === "frequency" ||
    k === "type" ||
    k.endsWith("type") ||
    k.endsWith("_type") ||
    k.endsWith("mode") ||
    k.endsWith("status")
  );
}

/**
 * Format one scalar. Returns null when the value has no customer-readable form,
 * which is the signal to the caller to omit the row entirely.
 */
export function formatScalar(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "boolean") {
    const labels = BOOLEAN_LABELS[key];
    return labels ? (value ? labels[0] : labels[1]) : value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    // NaN and Infinity are the two ways a number reaches the UI as nonsense.
    return Number.isFinite(value) ? value.toLocaleString() : null;
  }

  if (value instanceof Date) {
    return formatDateTime(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (isUuid(trimmed)) return null;
    if (key === "report") return REPORT_LABELS[trimmed] ?? titleCase(trimmed);
    if (DATE_ONLY_RE.test(trimmed)) return formatShortDate(trimmed);
    if (DATE_TIME_RE.test(trimmed)) return formatDateTime(trimmed) ?? null;
    if (isEnumKey(key)) return titleCase(trimmed);
    // A bare lowercase token is almost always a stored enum ("monday",
    // "pending_approval"), which should read as a word. Anything with a dot,
    // slash, "@" or hyphen is left alone — those are emails, time zones,
    // and slugs, where the exact characters are the point.
    if (/^[a-z][a-z0-9_]{0,23}$/.test(trimmed)) return titleCase(trimmed);
    return trimmed;
  }

  return null;
}

/**
 * Format a value that may be a scalar or a flat list of scalars. Objects and
 * lists of objects return null — those are the flattener's job, not a cell's.
 */
export function formatValue(key: string, value: unknown): string | null {
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => formatScalar(key, item))
      .filter((v): v is string => v !== null);
    if (parts.length === 0) return null;
    return parts.join(", ");
  }
  return formatScalar(key, value);
}

// ── Change entries ───────────────────────────────────────────────────────────

/**
 * The shape written by every "edit a record" route: settings, invitations and
 * membership access all record `{ field, label, from, to }` per changed field.
 * It already carries a human label, so it renders as a proper before/after row.
 */
export interface AuditChangeEntry {
  field: string;
  label?: string;
  from?: unknown;
  to?: unknown;
}

function isChangeEntry(value: unknown): value is AuditChangeEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "field" in value &&
    typeof (value as { field: unknown }).field === "string"
  );
}

function isChangeEntryList(value: unknown): value is AuditChangeEntry[] {
  return Array.isArray(value) && value.length > 0 && value.every(isChangeEntry);
}

function formatChangeEntry(change: AuditChangeEntry): DetailItem {
  const label = change.label?.trim() || friendlyLabel(change.field);
  const from = formatValue(change.field, change.from);
  const to = formatValue(change.field, change.to);

  if (from && to) return { label, value: `${from} → ${to}` };
  if (to) return { label, value: `Set to ${to}` };
  if (from) return { label, value: `Cleared (was ${from})` };
  return { label, value: "Updated" };
}

// ── Flattening ───────────────────────────────────────────────────────────────

/**
 * Turn an arbitrary details blob into display rows, dropping anything we can't
 * name. This is the fallback for actions with no bespoke `details` renderer,
 * and the reason a new write site can't put "[object Object]" on screen.
 */
export function flattenDetails(
  details: Record<string, unknown>,
  options: { skipKeys?: ReadonlySet<string> } = {},
): DetailItem[] {
  const items: DetailItem[] = [];
  const skip = options.skipKeys;

  const walk = (source: Record<string, unknown>, prefix: string, depth: number) => {
    for (const [key, value] of Object.entries(source)) {
      if (skip?.has(key)) continue;
      // Bookkeeping the UI resolves elsewhere — the actor label already says it.
      if (key === "initiated_by") continue;
      if (value === null || value === undefined) continue;
      if (isIdKey(key)) continue;

      const label = prefix ? friendlyLabel(`${prefix} ${key}`) : friendlyLabel(key);

      if (isChangeEntryList(value)) {
        for (const change of value) items.push(formatChangeEntry(change));
        continue;
      }

      if (Array.isArray(value) || typeof value !== "object") {
        const formatted = formatValue(key, value);
        if (formatted !== null) items.push({ label, value: formatted });
        continue;
      }

      if (depth < MAX_DEPTH) {
        walk(value as Record<string, unknown>, prefix ? `${prefix} ${key}` : key, depth + 1);
      }
      // Deeper than MAX_DEPTH: deliberately dropped. A customer has no use for
      // a nested snapshot, and stringifying it is how "[object Object]" ships.
    }
  };

  walk(details, "", 0);
  return items;
}

// ── Typed accessors ──────────────────────────────────────────────────────────

/**
 * A read-only view over a details blob. Registry specs receive this instead of
 * the raw object so a spec physically cannot interpolate an unrendered value
 * into its copy — every getter returns a string, a number, or null.
 */
export class AuditDetails {
  constructor(private readonly raw: Record<string, unknown>) {}

  has(key: string): boolean {
    const value = this.raw[key];
    return value !== null && value !== undefined && value !== "";
  }

  /** First key that holds a non-empty, non-UUID string. */
  text(...keys: string[]): string | null {
    for (const key of keys) {
      const value = this.raw[key];
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed || isUuid(trimmed)) continue;
      return trimmed;
    }
    return null;
  }

  /** Like `text`, but title-cased — for enum values such as roles or statuses. */
  label(...keys: string[]): string | null {
    const value = this.text(...keys);
    return value === null ? null : titleCase(value);
  }

  number(...keys: string[]): number | null {
    for (const key of keys) {
      const value = this.raw[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return null;
  }

  count(...keys: string[]): number {
    return this.number(...keys) ?? 0;
  }

  bool(...keys: string[]): boolean | null {
    for (const key of keys) {
      const value = this.raw[key];
      if (typeof value === "boolean") return value;
    }
    return null;
  }

  /** A short date ("May 4") for a YYYY-MM-DD or ISO value. */
  date(...keys: string[]): string | null {
    const value = this.text(...keys);
    if (value === null) return null;
    if (DATE_ONLY_RE.test(value) || DATE_TIME_RE.test(value)) return formatShortDate(value);
    return null;
  }

  /** The raw "YYYY-MM-DD" value, for callers that format a range themselves. */
  isoDate(...keys: string[]): string | null {
    const value = this.text(...keys);
    if (value === null) return null;
    if (DATE_ONLY_RE.test(value)) return value;
    if (DATE_TIME_RE.test(value)) return value.slice(0, 10);
    return null;
  }

  list(...keys: string[]): string[] {
    for (const key of keys) {
      const value = this.raw[key];
      if (!Array.isArray(value)) continue;
      const parts = value
        .map((item) => formatScalar(key, item))
        .filter((v): v is string => v !== null);
      if (parts.length > 0) return parts;
    }
    return [];
  }

  record(key: string): Record<string, unknown> | null {
    const value = this.raw[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  changes(): AuditChangeEntry[] {
    const value = this.raw.changes;
    return isChangeEntryList(value) ? value : [];
  }

  /** The person this entry is about, assembled from whichever keys are present. */
  personName(): string | null {
    const first = this.text("firstName", "first_name");
    const last = this.text("lastName", "last_name");
    if (first && last) return `${first} ${last}`;
    return first ?? last ?? this.text("name") ?? this.text("email");
  }

  /** Escape hatch for specs that need to inspect an unusual shape themselves. */
  rawValue(key: string): unknown {
    return this.raw[key];
  }

  toObject(): Record<string, unknown> {
    return this.raw;
  }
}
