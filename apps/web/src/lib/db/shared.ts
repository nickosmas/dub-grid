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

// ── Batched save for sort-ordered, soft-deletable named entities ─────────────
// departments / certifications / organization_roles all share the same save
// shape: soft-delete removed rows, update kept rows, and insert new ones —
// reusing (restoring) an archived row when an incoming name matches, to avoid
// duplicate-name rows. The old per-item loops issued ~2N sequential round-trips
// (a name lookup + a write per new item, plus one update per kept item). This
// collapses that to a constant handful: one delete, the updates in parallel,
// one archived-name lookup, the restores in parallel, and one bulk insert.
//
// Updates/restores can't be a single statement (each row has different values)
// and can't be an upsert-by-id (the PK is GENERATED ALWAYS AS IDENTITY, which
// rejects an explicit id on the INSERT path of ON CONFLICT) — so they run as
// parallel single-row writes instead.
export interface SaveNamedEntitiesResult {
  created: number;
  updated: number;
  archived: number;
}

export async function saveNamedEntities<T extends { id: number; name: string }>(opts: {
  table: string;
  orgId: string;
  items: T[];
  existing: { id: number }[];
  /** Column payload for a row, excluding id/org_id/archived_at. */
  toRow: (item: T, sortOrder: number) => Record<string, unknown>;
}): Promise<SaveNamedEntitiesResult> {
  const { table, orgId, items, existing, toRow } = opts;
  const existingIds = new Set(existing.map((e) => e.id));
  const newIds = new Set(items.filter((i) => i.id).map((i) => i.id));

  // 1. Soft-delete removed items (row persists — FK/array references stay valid)
  const toDelete = existing.filter((e) => !newIds.has(e.id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from(table)
      .update({ archived_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .in("id", toDelete.map((d) => d.id));
    if (error) throw error;
  }

  const toUpdate = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id > 0 && existingIds.has(item.id));
  const toInsert = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id <= 0 || !existingIds.has(item.id));

  // 2. Updates — parallel single-row writes
  await Promise.all(
    toUpdate.map(async ({ item, sortOrder }) => {
      const { error } = await supabase
        .from(table)
        .update(toRow(item, sortOrder))
        .eq("org_id", orgId)
        .eq("id", item.id);
      if (error) throw error;
    }),
  );

  // 3. One batched lookup for archived rows matching incoming names
  const archivedByName = new Map<string, number>();
  if (toInsert.length > 0) {
    const names = [...new Set(toInsert.map(({ item }) => item.name))];
    const { data, error } = await supabase
      .from(table)
      .select("id, name")
      .eq("org_id", orgId)
      .in("name", names)
      .not("archived_at", "is", null);
    if (error) throw error;
    for (const row of (data ?? []) as { id: number; name: string }[]) {
      if (!archivedByName.has(row.name)) archivedByName.set(row.name, row.id);
    }
  }

  // 4. Split inserts into restores (reuse one archived row per name) vs fresh
  const usedArchivedIds = new Set<number>();
  const restores: { id: number; row: Record<string, unknown> }[] = [];
  const fresh: Record<string, unknown>[] = [];
  for (const { item, sortOrder } of toInsert) {
    const archivedId = archivedByName.get(item.name);
    if (archivedId !== undefined && !usedArchivedIds.has(archivedId)) {
      usedArchivedIds.add(archivedId);
      restores.push({ id: archivedId, row: { ...toRow(item, sortOrder), archived_at: null } });
    } else {
      fresh.push({ org_id: orgId, ...toRow(item, sortOrder) });
    }
  }

  await Promise.all(
    restores.map(async ({ id, row }) => {
      const { error } = await supabase
        .from(table)
        .update(row)
        .eq("org_id", orgId)
        .eq("id", id);
      if (error) throw error;
    }),
  );
  if (fresh.length > 0) {
    const { error } = await supabase.from(table).insert(fresh);
    if (error) throw error;
  }

  return { created: toInsert.length, updated: toUpdate.length, archived: toDelete.length };
}

// ── Auto-paginating row fetch ────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 500;

export interface PagedQueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Loops `fetchPage(from, to)` — each call must build and return a FRESH
 * query (Supabase builders are single-use once awaited) filtered to that row
 * window via `.range(from, to)` on a query with a stable `.order(...)` —
 * accumulating pages until one comes back with fewer rows than `pageSize`.
 * PostgREST's own row cap (`max_rows`) differs across environments and
 * truncates silently (200 OK, no error, no thrown exception), so we detect
 * "last page" ourselves using a page size safely below any plausible server
 * cap rather than trusting the server not to have truncated already.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PagedQueryResult<T>>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    // A page shorter than requested means we've reached the end. A page
    // that's an exact multiple of pageSize triggers one harmless trailing
    // request that comes back empty — expected, not an off-by-one to "fix".
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
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

export const ORGANIZATION_COLS = "id, name, slug, address, address_line_1, address_line_2, address_city, address_state, address_postal_code, address_country, phone, employee_count, focus_area_label, certification_label, role_label, department_label, shift_display_mode, timezone, pay_period_start_date, archived_at, suspended_at, suspended_reason, workspace_kind, sandbox_owner_user_id, sandbox_source_org_id, enforce_conflict_prevention, coverage_rule_config, open_shift_visibility, subscription_status, trial_ends_at, trial_started_at, data_retention_days, feature_overrides, updated_at";
export const ORGANIZATION_WITH_BILLING_COLS = `${ORGANIZATION_COLS}, stripe_customer_id, subscription_seats`;
export const FOCUS_AREA_COLS = "id, org_id, department_id, name, color, sort_order, archived_at";
export const DEPARTMENT_COLS = "id, org_id, name, abbr, type, sort_order, archived_at, permissions";
export const SHIFT_CODE_COLS = "id, org_id, label, name, color, border_color, text_color, category_id, shift_id, job_id, is_general, focus_area_id, sort_order, required_certification_ids, default_start_time, default_end_time, default_duration_hours, default_duration_minutes, archived_at";
export const SHIFT_CATEGORY_COLS = "id, org_id, name, abbr, start_time, end_time, color, sort_order, focus_area_id, break_minutes, archived_at";
export const JOB_COLS = "id, org_id, name, abbr, show_on_grid, assignment_mode, eligibility_mode, focus_area_ids, department_ids, applicable_shift_ids, eligible_role_ids, required_certification_ids, color, border_color, text_color, shift_time_overrides, shift_color_overrides, default_start_time, default_end_time, default_duration_hours, default_duration_minutes, sort_order, system_key, archived_at";
export const NAMED_ITEM_COLS = "id, org_id, name, abbr, department_id, sort_order, archived_at";
export const ORG_ROLE_COLS = "id, org_id, name, abbr, is_schedule_role, department_id, sort_order, archived_at";
export const EMPLOYEE_COLS = "id, org_id, employee_number, first_name, last_name, employment_type, status, status_changed_at, status_note, certification_id, role_ids, seniority, focus_area_ids, phone, email, contact_notes, archived_at, user_id, department_ids, dept_admin_ids, version, created_at";
export const COVERAGE_REQ_COLS = "id, org_id, focus_area_id, job_id, preferred_shift_id, day_of_week, min_staff";
export const ABSENCE_TYPE_COLS = "id, org_id, label, name, color, border_color, text_color, sort_order, archived_at";
export const INDICATOR_TYPE_COLS = "id, org_id, name, color, sort_order, archived_at";
export const RECURRING_SHIFT_COLS = "id, emp_id, org_id, day_of_week, state, effective_from, effective_until, created_at, updated_at, archived_at";
