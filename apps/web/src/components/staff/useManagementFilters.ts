import { useMemo, useState } from "react";
import type { DirectoryPerson, OrganizationRole } from "@/types";

/** Everyone, or one access tier. */
export type ManagementRoleFilter = "all" | OrganizationRole;
/** Whether the invitation behind a roster row has been accepted yet. */
export type ManagementInvitationFilter = "all" | "has_access" | "pending";
export type ManagementSortKey = "name" | "access";

/** Super admins first, then admins, then everyone else. */
const ROLE_RANK: Record<OrganizationRole, number> = {
  super_admin: 0,
  admin: 1,
  user: 2,
};

/** Offered in the same order the access sort ranks them. */
export const MANAGEMENT_ROLE_FILTERS: OrganizationRole[] = ["super_admin", "admin", "user"];

/**
 * A roster row whose invitation is still outstanding: invited, but with no
 * app access yet. The table's status column reads the same two fields.
 */
export function isPendingManagementInvite(person: DirectoryPerson): boolean {
  return person.invitationStatus !== null && !person.hasAppAccess;
}

function getRoleRank(role: OrganizationRole | null): number {
  return role ? ROLE_RANK[role] : ROLE_RANK.user + 1;
}

function getFullName(person: DirectoryPerson): string {
  return `${person.firstName} ${person.lastName}`.trim() || person.email;
}

/**
 * The management roster's own filters, the counterpart to `useStaffFilters`.
 *
 * The two halves of the directory are different populations: a staff row has
 * a focus area, a certification and an employment type, a roster row has a
 * management department, an access level and an invitation. Neither set says
 * anything about the other list, so each half filters on its own.
 */
export function useManagementFilters({
  managementUsers,
  searchQuery,
  searchEnabled,
}: {
  managementUsers: DirectoryPerson[];
  searchQuery: string;
  /** The search box is shared, so it only applies while this half is showing. */
  searchEnabled: boolean;
}) {
  const [deptFilterId, setDeptFilterId] = useState<number | null>(null);
  const [filterRole, setFilterRole] = useState<ManagementRoleFilter>("all");
  const [filterInvitation, setFilterInvitation] = useState<ManagementInvitationFilter>("all");
  const [sortKey, setSortKey] = useState<ManagementSortKey>("name");

  const activeFilterCount = [
    deptFilterId !== null,
    filterRole !== "all",
    filterInvitation !== "all",
    sortKey !== "name",
  ].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;

  function clearFilters() {
    setDeptFilterId(null);
    setFilterRole("all");
    setFilterInvitation("all");
    setSortKey("name");
  }

  const filteredUsers = useMemo(() => {
    const query = searchEnabled ? searchQuery.trim().toLowerCase() : "";

    return managementUsers
      .filter((person) => {
        if (deptFilterId === -1) {
          if (person.managementDepartmentIds.length > 0) return false;
        } else if (deptFilterId !== null) {
          if (!person.managementDepartmentIds.includes(deptFilterId)) return false;
        }

        if (filterRole !== "all" && person.orgRole !== filterRole) return false;

        if (filterInvitation !== "all") {
          const pending = isPendingManagementInvite(person);
          if (filterInvitation === "pending" ? !pending : pending) return false;
        }

        if (!query) return true;
        return (
          getFullName(person).toLowerCase().includes(query) ||
          person.email.toLowerCase().includes(query) ||
          (person.phone ? person.phone.includes(query) : false)
        );
      })
      .sort((left, right) => {
        if (sortKey === "access") {
          const rankComparison = getRoleRank(left.orgRole) - getRoleRank(right.orgRole);
          if (rankComparison !== 0) return rankComparison;
        }

        return getFullName(left).localeCompare(getFullName(right));
      });
  }, [
    deptFilterId,
    filterInvitation,
    filterRole,
    managementUsers,
    searchEnabled,
    searchQuery,
    sortKey,
  ]);

  return {
    deptFilterId,
    setDeptFilterId,
    filterRole,
    setFilterRole,
    filterInvitation,
    setFilterInvitation,
    sortKey,
    setSortKey,
    filteredUsers,
    hasActiveFilters,
    activeFilterCount,
    clearFilters,
  };
}
