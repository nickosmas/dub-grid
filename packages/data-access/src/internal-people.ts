import type { SupabaseClient } from "@supabase/supabase-js";

export interface InternalPeopleViewer {
  userId: string;
  isGridmaster: boolean;
}

/**
 * Internal (QA) accounts are shown only to a Gridmaster or another internal
 * account. Migration 081 applies the same rule to direct database reads.
 */
export function canSeeInternalPeople(viewer: { isGridmaster: boolean; isInternal: boolean }) {
  return viewer.isGridmaster || viewer.isInternal;
}

/** Every internal account's user id, whoever is asking. */
export async function fetchInternalUserIds(
  client: Pick<SupabaseClient, "from">,
): Promise<string[]> {
  const { data, error } = await client.from("profiles").select("id").eq("is_internal", true);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

// The list is platform-wide and changes when an account is marked internal,
// which is rare, while most schedule and people reads ask for it first. Each
// process keeps it for half a minute, sharing one read in flight.
const INTERNAL_IDS_MEMO_MS = 30_000;
let internalIdsMemo: { ids: Promise<string[]>; expiresAt: number } | null = null;

/** Test seam: forgets the remembered list. */
export function resetInternalUserIdsMemo(): void {
  internalIdsMemo = null;
}

function rememberedInternalUserIds(client: Pick<SupabaseClient, "from">): Promise<string[]> {
  const now = Date.now();
  if (internalIdsMemo && internalIdsMemo.expiresAt > now) return internalIdsMemo.ids;
  const ids = fetchInternalUserIds(client);
  const entry = { ids, expiresAt: now + INTERNAL_IDS_MEMO_MS };
  internalIdsMemo = entry;
  ids.catch(() => {
    if (internalIdsMemo === entry) internalIdsMemo = null;
  });
  return ids;
}

/** The user ids to leave out of what `viewer` is shown; empty when they may see everyone. */
export async function fetchHiddenInternalUserIds(
  client: SupabaseClient,
  viewer: InternalPeopleViewer,
): Promise<string[]> {
  if (viewer.isGridmaster) return [];
  const ids = await rememberedInternalUserIds(client);
  const isInternal = ids.includes(viewer.userId);
  return canSeeInternalPeople({ isGridmaster: false, isInternal }) ? [] : ids;
}

/** The staff ids, in one organization, of the people in `hiddenUserIds`; their shifts are hidden too. */
export async function fetchHiddenEmployeeIds(
  client: SupabaseClient,
  orgId: string,
  hiddenUserIds: readonly string[],
): Promise<string[]> {
  if (hiddenUserIds.length === 0) return [];
  const { data, error } = await client
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .in("user_id", [...hiddenUserIds]);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

const idList = (ids: readonly string[]) => `(${ids.join(",")})`;

/**
 * Leaves hidden people's staff rows out of an `employees` query; staff with no
 * account stay. Pass `referencedTable: "employees"` to filter a query that
 * embeds `employees!inner(user_id, ...)`, such as schedule cells.
 */
export function withoutHiddenStaff<
  Query extends { or(filters: string, options?: { referencedTable?: string }): Query },
>(query: Query, hiddenUserIds: readonly string[], referencedTable?: string): Query {
  if (hiddenUserIds.length === 0) return query;
  const filter = `user_id.is.null,user_id.not.in.${idList(hiddenUserIds)}`;
  return referencedTable ? query.or(filter, { referencedTable }) : query.or(filter);
}

/** Leaves hidden people out of a query on a table whose `user_id` is never null. */
export function withoutHiddenMembers<
  Query extends { not(column: string, operator: string, value: unknown): Query },
>(query: Query, hiddenUserIds: readonly string[]): Query {
  if (hiddenUserIds.length === 0) return query;
  return query.not("user_id", "in", idList(hiddenUserIds));
}

/** Drops rows keyed by a hidden staff member's `emp_id`, such as published changes. */
export function withoutHiddenStaffRows<Row extends { emp_id: string }>(
  rows: readonly Row[],
  hiddenStaffIds: ReadonlySet<string>,
): Row[] {
  if (hiddenStaffIds.size === 0) return [...rows];
  return rows.filter((row) => !hiddenStaffIds.has(row.emp_id));
}

/** Drops shift requests a hidden staff member made or is the target of. */
export function withoutHiddenRequests<
  Row extends { requester_emp_id: string; target_emp_id: string | null },
>(rows: readonly Row[], hiddenStaffIds: ReadonlySet<string>): Row[] {
  if (hiddenStaffIds.size === 0) return [...rows];
  return rows.filter(
    (row) =>
      !hiddenStaffIds.has(row.requester_emp_id) &&
      (row.target_emp_id == null || !hiddenStaffIds.has(row.target_emp_id)),
  );
}
