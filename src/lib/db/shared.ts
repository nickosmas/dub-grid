import { supabase } from "@/lib/supabase";
import { cacheThrough, cacheDel, CacheKey, TTL } from "@/lib/cache";
import { logAudit } from "@/lib/audit";
import { arraysEqual, formatDateKey, iterateDateRange } from "@/lib/utils";
import { MAX_SERIES_OCCURRENCES } from "@/lib/constants";
import { parseHost } from "@/lib/subdomain";

// Re-export all imports that other modules will need
export { supabase, cacheThrough, cacheDel, CacheKey, TTL, logAudit, arraysEqual, formatDateKey, iterateDateRange, MAX_SERIES_OCCURRENCES, parseHost };

// ── PostgREST filter sanitization ──────────────────────────────────────────
// Values interpolated into .or() filter strings must not contain PostgREST
// operators that could alter query semantics.
const POSTGREST_UNSAFE = /[(),."\\]/;

export function assertSafeFilterValue(value: string, label: string): void {
  if (POSTGREST_UNSAFE.test(value)) {
    throw new Error(`Unsafe PostgREST filter value for ${label}`);
  }
}

// ── Optimistic Locking Error ──────────────────────────────────────────────────

export class OptimisticLockError extends Error {
  constructor(
    public readonly shiftId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion?: number
  ) {
    super(
      `Optimistic lock failed for shift ${shiftId}: expected version ${expectedVersion}${actualVersion !== undefined ? `, but found version ${actualVersion}` : ""
      }`
    );
    this.name = "OptimisticLockError";
  }
}

/** Strip seconds from PostgreSQL TIME values ("HH:MM:SS" → "HH:MM"). */
export function trimTime(t: string | null): string | null {
  if (!t) return t;
  const parts = t.split(":");
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : t;
}

/** Resolve an array of shift_code IDs to a slash-separated label string. */
export function resolveCodeLabels(ids: number[], codeMap: Map<number, string>): string {
  return ids.map(id => codeMap.get(id) ?? '?').join('/');
}

// ── Column projections (avoid select('*') to reduce payload) ─────────────────

export const ORGANIZATION_COLS = "id, name, slug, address, phone, employee_count, focus_area_label, certification_label, role_label, department_label, shift_display_mode, timezone, archived_at, suspended_at, suspended_reason, enforce_conflict_prevention, stripe_customer_id, subscription_status, trial_ends_at, subscription_seats, data_retention_days, feature_overrides";
export const FOCUS_AREA_COLS = "id, org_id, department_id, name, color_bg, color_text, sort_order, archived_at";
export const DEPARTMENT_COLS = "id, org_id, name, abbr, type, sort_order, archived_at, permissions";
export const SHIFT_CODE_COLS = "id, org_id, label, name, color, border_color, text_color, category_id, is_general, focus_area_id, sort_order, required_certification_ids, default_start_time, default_end_time, default_duration_hours, default_duration_minutes, archived_at";
export const SHIFT_CATEGORY_COLS = "id, org_id, name, color, start_time, end_time, sort_order, focus_area_id, break_minutes, archived_at";
export const NAMED_ITEM_COLS = "id, org_id, name, abbr, department_id, sort_order, archived_at";
export const EMPLOYEE_COLS = "id, org_id, first_name, last_name, status, status_changed_at, status_note, certification_id, role_ids, seniority, focus_area_ids, phone, email, contact_notes, archived_at, user_id, department_ids, dept_admin_ids, version";
export const COVERAGE_REQ_COLS = "id, org_id, focus_area_id, shift_code_id, day_of_week, min_staff";
export const ABSENCE_TYPE_COLS = "id, org_id, label, name, color, border_color, text_color, sort_order, archived_at";
export const INDICATOR_TYPE_COLS = "id, org_id, name, color, sort_order, archived_at";
export const RECURRING_SHIFT_COLS = "id, emp_id, org_id, day_of_week, shift_code_id, absence_type_id, effective_from, effective_until, created_at, updated_at, archived_at";
