import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DirectoryPerson } from "@/types";
import { useManagementFilters } from "./useManagementFilters";

function person(id: string, overrides: Partial<DirectoryPerson>): DirectoryPerson {
  return {
    personId: id,
    source: "employee",
    employeeId: id,
    employeeNumber: null,
    userId: `user-${id}`,
    firstName: id,
    lastName: "",
    email: `${id}@example.test`,
    phone: "",
    employeeStatus: "active",
    orgRole: "user",
    hasAppAccess: true,
    focusAreaIds: [],
    certificationId: null,
    roleIds: [],
    seniority: null,
    lastSignInAt: null,
    invitationStatus: null,
    scheduledDepartmentIds: [],
    scheduledDeptAdminIds: [],
    managementDepartmentIds: [],
    managementDeptAdminIds: [],
    departmentIds: [],
    deptAdminIds: [],
    isManagementUser: true,
    ...overrides,
  };
}

const SUPER = person("super", { orgRole: "super_admin" });
const ADMIN = person("admin", { orgRole: "admin" });
const PENDING_ADMIN = person("pending", {
  orgRole: "admin",
  invitationStatus: "pending",
  hasAppAccess: false,
});
const USER = person("user", { orgRole: "user" });

function renderRoster() {
  return renderHook(() =>
    useManagementFilters({
      managementUsers: [SUPER, ADMIN, PENDING_ADMIN, USER],
      searchQuery: "",
      searchEnabled: true,
    }),
  );
}

const ids = (people: DirectoryPerson[]) => people.map((entry) => entry.personId).sort();

describe("useManagementFilters", () => {
  it("keeps anyone in any of the ticked access tiers", () => {
    const { result } = renderRoster();

    act(() => result.current.setFilterRole(["super_admin", "admin"]));

    expect(ids(result.current.filteredUsers)).toEqual(["admin", "pending", "super"]);
    expect(result.current.activeFilterCount).toBe(1);
  });

  it("needs a match in both filters when both have a choice ticked", () => {
    const { result } = renderRoster();

    act(() => {
      result.current.setFilterRole(["admin"]);
      result.current.setFilterInvitation(["pending"]);
    });

    expect(ids(result.current.filteredUsers)).toEqual(["pending"]);
  });

  it("keeps everyone when both invitation states are ticked, and clears to none", () => {
    const { result } = renderRoster();

    act(() => result.current.setFilterInvitation(["has_access", "pending"]));
    expect(result.current.filteredUsers).toHaveLength(4);

    act(() => result.current.clearFilters());
    expect(result.current.filterInvitation).toEqual([]);
    expect(result.current.hasActiveFilters).toBe(false);
  });
});
