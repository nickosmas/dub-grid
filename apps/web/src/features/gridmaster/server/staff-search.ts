import type { SupabaseClient } from "@supabase/supabase-js";
import type { GridmasterStaffSearchResult } from "../person-record";

export const STAFF_SEARCH_MIN_LENGTH = 2;
const RESULT_LIMIT = 25;

/**
 * Search terms reduced to characters a name, email or phone can hold, so a
 * term can sit inside a PostgREST `or` filter without escaping.
 */
export function toSearchTerms(query: string): string[] {
  return query
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}@.+'-]/gu, ""))
    .filter((term) => term.length > 0)
    .slice(0, 3);
}

/** Staff with no account, across every organization; every term must match a field. */
export async function searchUnlinkedStaff(
  client: SupabaseClient,
  terms: string[],
): Promise<GridmasterStaffSearchResult[]> {
  let request = client
    .from("employees")
    .select(
      "id, org_id, first_name, last_name, email, phone, status, archived_at, organizations(name)",
    )
    .is("user_id", null);
  for (const term of terms) {
    request = request.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
    );
  }
  const { data, error } = await request.order("last_name").limit(RESULT_LIMIT);
  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => {
    const organization = row.organizations as { name?: string } | null;
    return {
      employeeId: row.id as string,
      orgId: row.org_id as string,
      orgName: organization?.name ?? "Unknown organization",
      name: `${(row.first_name as string | null) ?? ""} ${(row.last_name as string | null) ?? ""}`.trim(),
      email: (row.email as string | null) ?? "",
      phone: (row.phone as string | null) ?? "",
      status: row.status as string,
      archivedAt: (row.archived_at as string | null) ?? null,
    };
  });
}
