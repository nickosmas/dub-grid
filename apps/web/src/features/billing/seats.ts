import { EMPLOYMENT_STATUS_LABELS } from "@dubgrid/domain";
import type { SeatBreakdown } from "@/types";

export interface SeatEmployee {
  status?: string | null;
  archived_at?: string | null;
  user_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export interface SeatMembership {
  user_id?: string | null;
  org_role?: string | null;
}

const MANAGING_ROLES = new Set(["admin", "super_admin"]);

function fullName(employee: SeatEmployee): string {
  return [employee.first_name, employee.last_name].filter(Boolean).join(" ").trim();
}

/**
 * Billed seats: active staff, inactive (Away) staff whose live membership can
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
    awayManaging: 0,
    awayManagingNames: [],
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
    } else if (employee.status === "active") {
      breakdown.activeStaff += 1;
    } else if (employee.status === "inactive") {
      if (employee.user_id && managingUserIds.has(employee.user_id)) {
        breakdown.awayManaging += 1;
        const name = fullName(employee);
        if (name) breakdown.awayManagingNames.push(name);
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
  breakdown.awayManagingNames.sort((a, b) => a.localeCompare(b));
  breakdown.total = breakdown.activeStaff + breakdown.awayManaging + breakdown.managementOnly;
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
  key: "active" | "away-managing" | "management-only" | "away" | "archived";
  label: string;
  count: number;
  detail?: string;
}

function listNames(names: readonly string[]): string {
  if (names.length <= 3) {
    return names.length < 2
      ? names.join("")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  const others = names.length - 2;
  return `${names.slice(0, 2).join(", ")} and ${others} others`;
}

/** The billing page's seat lines: who's billed, then who isn't. Empty lines are left out. */
export function describeSeatBreakdown(breakdown: SeatBreakdown): {
  billed: SeatBreakdownLine[];
  notBilled: SeatBreakdownLine[];
} {
  const billed: SeatBreakdownLine[] = [
    { key: "active", label: "Active staff", count: breakdown.activeStaff },
  ];
  if (breakdown.awayManaging > 0) {
    const names = listNames(breakdown.awayManagingNames);
    billed.push({
      key: "away-managing",
      label: "Away, can manage",
      count: breakdown.awayManaging,
      detail: `${names ? `${names}. ` : ""}Away people take a seat only while they keep management access.`,
    });
  }
  if (breakdown.managementOnly > 0) {
    billed.push({
      key: "management-only",
      label: "Managers without a staff record",
      count: breakdown.managementOnly,
    });
  }
  const notBilled: SeatBreakdownLine[] = [];
  if (breakdown.awayNotBilled > 0) {
    notBilled.push({ key: "away", label: "Away", count: breakdown.awayNotBilled });
  }
  if (breakdown.archived > 0) {
    notBilled.push({
      key: "archived",
      label: EMPLOYMENT_STATUS_LABELS.removed,
      count: breakdown.archived,
    });
  }
  return { billed, notBilled };
}
