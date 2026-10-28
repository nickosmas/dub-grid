import { EMPLOYMENT_STATUS_LABELS } from "@dubgrid/domain";
import type { SeatBreakdown } from "@/types";

export interface SeatEmployee {
  status?: string | null;
  archived_at?: string | null;
  suspended_at?: string | null;
  user_id?: string | null;
}

export interface SeatMembership {
  user_id?: string | null;
  org_role?: string | null;
}

const MANAGING_ROLES = new Set(["admin", "super_admin"]);

/**
 * Billed seats: active staff (suspended ones included, counted apart), inactive (Away) staff whose live membership can
 * still manage (Admin or Super Admin), plus live members linked to no staff
 * record. `employees` must include inactive and removed rows, so a member whose
 * staff record has left is recognised as that person rather than billed as a
 * management-only user. `memberships` must already exclude archived rows.
 * Internal (QA) accounts are never billed or listed, as staff or as members.
 */
export function breakdownBillableSeats(
  employees: readonly SeatEmployee[],
  memberships: readonly SeatMembership[],
  internalUserIds: ReadonlySet<string> = new Set(),
): SeatBreakdown {
  const managingUserIds = new Set(
    memberships
      .filter((membership) => MANAGING_ROLES.has(membership.org_role ?? ""))
      .map((membership) => membership.user_id),
  );
  const staffUserIds = new Set<string>();
  const breakdown: SeatBreakdown = {
    activeStaff: 0,
    suspended: 0,
    awayManaging: 0,
    managementOnly: 0,
    awayNotBilled: 0,
    archived: 0,
    total: 0,
  };
  for (const employee of employees) {
    if (employee.user_id) staffUserIds.add(employee.user_id);
    if (employee.user_id && internalUserIds.has(employee.user_id)) continue;
    if (employee.archived_at || employee.status === "removed") {
      breakdown.archived += 1;
    } else if (employee.status === "active" && employee.suspended_at) {
      breakdown.suspended += 1;
    } else if (employee.status === "active") {
      breakdown.activeStaff += 1;
    } else if (employee.status === "inactive") {
      if (employee.user_id && managingUserIds.has(employee.user_id)) {
        breakdown.awayManaging += 1;
      } else {
        breakdown.awayNotBilled += 1;
      }
    }
  }
  const managementOnly = new Set<string>();
  for (const { user_id: userId } of memberships) {
    if (userId && !staffUserIds.has(userId) && !internalUserIds.has(userId)) {
      managementOnly.add(userId);
    }
  }
  breakdown.managementOnly = managementOnly.size;
  breakdown.total =
    breakdown.activeStaff + breakdown.suspended + breakdown.awayManaging + breakdown.managementOnly;
  return breakdown;
}

export function countBillableSeats(
  employees: readonly SeatEmployee[],
  memberships: readonly SeatMembership[],
  internalUserIds: ReadonlySet<string> = new Set(),
): number {
  return breakdownBillableSeats(employees, memberships, internalUserIds).total;
}

export interface SeatBreakdownLine {
  key: "active" | "suspended" | "away-managing" | "management-only" | "away" | "archived";
  label: string;
  count: number;
  detail?: string;
}

/** The billing page's seat lines: who's billed, then who isn't. Empty lines are left out. */
export function describeSeatBreakdown(breakdown: SeatBreakdown): {
  billed: SeatBreakdownLine[];
  notBilled: SeatBreakdownLine[];
} {
  const billed: SeatBreakdownLine[] = [
    {
      key: "active",
      label: "Active staff",
      count: breakdown.activeStaff,
      detail: "Everyone on staff with an Active status, whether or not they have an account.",
    },
  ];
  if (breakdown.suspended > 0) {
    billed.push({
      key: "suspended",
      label: "Suspended staff",
      count: breakdown.suspended,
      detail: "People who are suspended keep their seat, even though they can't sign in.",
    });
  }
  if (breakdown.awayManaging > 0) {
    billed.push({
      key: "away-managing",
      label: "Away staff who can manage",
      count: breakdown.awayManaging,
      detail: "People who are away keep their seat while they still have management access.",
    });
  }
  if (breakdown.managementOnly > 0) {
    billed.push({
      key: "management-only",
      label: "Managers without a staff record",
      count: breakdown.managementOnly,
      detail: "People who can sign in to manage the organization but aren't on the schedule.",
    });
  }
  const notBilled: SeatBreakdownLine[] = [];
  if (breakdown.awayNotBilled > 0) {
    notBilled.push({
      key: "away",
      label: "Away staff who can't manage",
      count: breakdown.awayNotBilled,
      detail: "They don't take a seat until they're back.",
    });
  }
  if (breakdown.archived > 0) {
    notBilled.push({
      key: "archived",
      label: `${EMPLOYMENT_STATUS_LABELS.removed} staff`,
      count: breakdown.archived,
      detail: `People who have been ${EMPLOYMENT_STATUS_LABELS.removed.toLowerCase()} never take a seat.`,
    });
  }
  return { billed, notBilled };
}
