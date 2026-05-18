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

function normalizeNumericId(value: number | string): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/** Resolve an array of assignment IDs to a slash-separated label string. */
export function resolveCodeLabels(
  ids: Array<number | string>,
  codeMap: Map<number, string>,
): string {
  return ids
    .map((id) => {
      const normalizedId = normalizeNumericId(id);
      return normalizedId != null ? codeMap.get(normalizedId) ?? "?" : "?";
    })
    .join("/");
}

// ── Column projections (avoid select('*') to reduce payload) ─────────────────

export const ORGANIZATION_COLS = "id, name, slug, address, address_line_1, address_line_2, address_city, address_state, address_postal_code, address_country, phone, employee_count, focus_area_label, certification_label, role_label, department_label, shift_display_mode, timezone, pay_period_start_date, archived_at, suspended_at, suspended_reason, workspace_kind, sandbox_source_org_id, sandbox_owner_user_id, sandbox_expires_at, sandbox_template_version, enforce_conflict_prevention, coverage_rule_config, subscription_status, trial_ends_at, data_retention_days, feature_overrides, updated_at";
export const ORGANIZATION_WITH_BILLING_COLS = `${ORGANIZATION_COLS}, stripe_customer_id, subscription_seats`;
export const FOCUS_AREA_COLS = "id, org_id, department_id, name, color, sort_order, archived_at";
export const DEPARTMENT_COLS = "id, org_id, name, abbr, type, sort_order, archived_at, permissions";
export const SHIFT_CODE_COLS = "id, org_id, label, name, color, border_color, text_color, category_id, shift_id, job_id, is_general, focus_area_id, sort_order, required_certification_ids, default_start_time, default_end_time, default_duration_hours, default_duration_minutes, archived_at";
export const SHIFT_CATEGORY_COLS = "id, org_id, name, abbr, start_time, end_time, color, sort_order, focus_area_id, break_minutes, archived_at";
export const JOB_COLS = "id, org_id, name, abbr, show_on_grid, assignment_mode, eligibility_mode, focus_area_ids, department_ids, applicable_shift_ids, eligible_role_ids, required_certification_ids, color, border_color, text_color, shift_time_overrides, shift_color_overrides, default_start_time, default_end_time, default_duration_hours, default_duration_minutes, sort_order, system_key, archived_at";
export const NAMED_ITEM_COLS = "id, org_id, name, abbr, department_id, sort_order, archived_at";
export const ORG_ROLE_COLS = "id, org_id, name, abbr, is_schedule_role, department_id, sort_order, archived_at";
export const EMPLOYEE_COLS = "id, org_id, first_name, last_name, employment_type, status, status_changed_at, status_note, certification_id, role_ids, seniority, focus_area_ids, phone, email, contact_notes, archived_at, user_id, department_ids, dept_admin_ids, version";
export const COVERAGE_REQ_COLS = "id, org_id, focus_area_id, job_id, preferred_shift_id, day_of_week, min_staff";
export const ABSENCE_TYPE_COLS = "id, org_id, label, name, color, border_color, text_color, sort_order, archived_at";
export const INDICATOR_TYPE_COLS = "id, org_id, name, color, sort_order, archived_at";
export const RECURRING_SHIFT_COLS = "id, emp_id, org_id, day_of_week, state, effective_from, effective_until, created_at, updated_at, archived_at";
