export interface SeatEmployee {
  status?: string | null;
  archived_at?: string | null;
  user_id?: string | null;
}

export interface SeatMembership {
  user_id?: string | null;
  org_role?: string | null;
}

const MANAGING_ROLES = new Set(["admin", "super_admin"]);

/**
 * Billed seats: active staff, inactive (Away) staff whose live membership can
 * still manage (Admin or Super Admin), plus live members linked to no staff
 * record. `employees` must include inactive and removed rows, so a member whose
 * staff record has left is recognised as that person rather than billed as a
 * management-only user. `memberships` must already exclude archived rows.
 * Internal (QA) accounts are never billed, as staff or as members.
 */
export function countBillableSeats(
  employees: readonly SeatEmployee[],
  memberships: readonly SeatMembership[],
  internalUserIds: ReadonlySet<string> = new Set(),
): number {
  const managingUserIds = new Set(
    memberships
      .filter((membership) => MANAGING_ROLES.has(membership.org_role ?? ""))
      .map((membership) => membership.user_id),
  );
  const staffUserIds = new Set<string>();
  let billedStaff = 0;
  for (const employee of employees) {
    if (employee.user_id) staffUserIds.add(employee.user_id);
    if (employee.user_id && internalUserIds.has(employee.user_id)) continue;
    if (employee.archived_at) continue;
    if (employee.status === "active") billedStaff += 1;
    else if (
      employee.status === "inactive" &&
      employee.user_id &&
      managingUserIds.has(employee.user_id)
    ) {
      billedStaff += 1;
    }
  }
  const managementOnly = new Set<string>();
  for (const { user_id: userId } of memberships) {
    if (userId && !staffUserIds.has(userId) && !internalUserIds.has(userId)) {
      managementOnly.add(userId);
    }
  }
  return billedStaff + managementOnly.size;
}
