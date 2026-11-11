import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Employee, OrganizationRole } from "@/types";
import { useStaffFilters } from "./useStaffFilters";

function buildEmployee(overrides: Partial<Employee> & Pick<Employee, "id">): Employee {
  return {
    firstName: "Test",
    lastName: "Person",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 0,
    focusAreaIds: [1],
    phone: "",
    email: "",
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 1,
    ...overrides,
  };
}

// Seniority deliberately runs opposite to privilege, so the default sort can
// never be mistaken for the access sort passing.
const SUPER_ADMIN = buildEmployee({ id: "sa", firstName: "Zoe", seniority: 3 });
const ADMIN = buildEmployee({ id: "ad", firstName: "Mira", seniority: 2 });
const USER = buildEmployee({ id: "us", firstName: "Ada", seniority: 1 });
const NO_LOGIN = buildEmployee({ id: "nl", firstName: "Bo", seniority: 0 });

const ORG_ROLES: ReadonlyMap<string, OrganizationRole> = new Map([
  ["sa", "super_admin"],
  ["ad", "admin"],
  ["us", "user"],
]);

function renderStaffFilters(options: { regularUserMode?: boolean } = {}) {
  return renderHook(() =>
    useStaffFilters({
      employees: [SUPER_ADMIN, ADMIN, USER, NO_LOGIN],
      focusAreas: [],
      certifications: [],
      roles: [],
      orgRoleByEmployeeId: ORG_ROLES,
      ...options,
    }),
  );
}

describe("useStaffFilters access tier", () => {
  it("narrows the directory to one access tier", () => {
    const { result } = renderStaffFilters();

    act(() => result.current.setFilterOrgRole("admin"));

    expect(result.current.sorted.map((employee) => employee.id)).toEqual(["ad"]);
  });

  // No account means no privileges, which is what User already describes.
  it("counts staff with no account as users rather than a fourth bucket", () => {
    const { result } = renderStaffFilters();

    act(() => result.current.setFilterOrgRole("user"));

    expect(result.current.sorted.map((employee) => employee.id).sort()).toEqual(["nl", "us"]);
  });

  it("filters admins out when the tier is set to plain users", () => {
    const { result } = renderStaffFilters();

    act(() => result.current.setFilterOrgRole("user"));

    expect(result.current.sorted.some((employee) => employee.id === "ad")).toBe(false);
    expect(result.current.sorted.some((employee) => employee.id === "sa")).toBe(false);
  });

  it("counts the tier as an active filter and clears with the rest", () => {
    const { result } = renderStaffFilters();

    act(() => result.current.setFilterOrgRole("admin"));
    expect(result.current.activeFilterCount).toBe(1);

    act(() => result.current.clearFilters());
    expect(result.current.filterOrgRole).toBe("all");
    expect(result.current.sorted).toHaveLength(4);
  });

  // The Access column is admin-only, so a regular user is never offered the
  // tier it narrows on and must not be silently filtered by a stale value.
  it("ignores the tier for regular users", () => {
    const { result } = renderStaffFilters({ regularUserMode: true });

    act(() => result.current.setFilterOrgRole("admin"));

    expect(result.current.sorted).toHaveLength(4);
    expect(result.current.activeFilterCount).toBe(0);
  });
});

describe("useStaffFilters access sort", () => {
  it("sorts by privilege, most privileged first", () => {
    const { result } = renderStaffFilters();

    act(() => result.current.handleSort("access"));

    expect(result.current.sorted.map((employee) => employee.id)).toEqual(["sa", "ad", "us", "nl"]);
  });

  it("reverses on a second click of the same header", () => {
    const { result } = renderStaffFilters();

    act(() => result.current.handleSort("access"));
    act(() => result.current.handleSort("access"));

    expect(result.current.sortConfig.dir).toBe("desc");
    expect(result.current.sorted.map((employee) => employee.id)).toEqual(["nl", "us", "ad", "sa"]);
  });

  it("breaks a tie inside a tier by name", () => {
    const { result } = renderHook(() =>
      useStaffFilters({
        employees: [
          buildEmployee({ id: "b", firstName: "Bea", seniority: 0 }),
          buildEmployee({ id: "a", firstName: "Ana", seniority: 1 }),
        ],
        focusAreas: [],
        certifications: [],
        roles: [],
        orgRoleByEmployeeId: new Map<string, OrganizationRole>([
          ["b", "admin"],
          ["a", "admin"],
        ]),
      }),
    );

    act(() => result.current.handleSort("access"));

    expect(result.current.sorted.map((employee) => employee.id)).toEqual(["a", "b"]);
  });
});

describe("useStaffFilters suspended tab", () => {
  const suspended = buildEmployee({
    id: "su",
    firstName: "Sam",
    suspendedAt: "2026-10-26T12:00:00Z",
  });

  it("counts suspended people without taking them out of Active or All", () => {
    const { result } = renderHook(() =>
      useStaffFilters({
        employees: [USER, suspended],
        inactiveEmployees: [buildEmployee({ id: "aw", status: "inactive" })],
        focusAreas: [],
        certifications: [],
        roles: [],
      }),
    );

    expect(result.current.tabCounts).toEqual({
      all: 3,
      active: 2,
      inactive: 1,
      suspended: 1,
      removed: 0,
    });
  });

  it("lists only suspended people on the Suspended tab", () => {
    const { result } = renderHook(() =>
      useStaffFilters({
        employees: [USER, suspended],
        focusAreas: [],
        certifications: [],
        roles: [],
      }),
    );

    act(() => result.current.setActiveTab("suspended"));

    expect(result.current.sorted.map((employee) => employee.id)).toEqual(["su"]);
  });

  it("returns to Active when the last suspended person is reinstated", () => {
    let employees = [USER, suspended];
    const { result, rerender } = renderHook(() =>
      useStaffFilters({ employees, focusAreas: [], certifications: [], roles: [] }),
    );
    act(() => result.current.setActiveTab("suspended"));

    employees = [USER, { ...suspended, suspendedAt: null }];
    rerender();

    expect(result.current.activeTab).toBe("active");
  });
});

describe("useStaffFilters account state", () => {
  const LINKED = buildEmployee({ id: "li", userId: "user-li", email: "li@example.test" });
  const INVITED = buildEmployee({ id: "in", email: "in@example.test" });
  const NOT_INVITED = buildEmployee({ id: "ni", email: "ni@example.test" });
  const NO_EMAIL = buildEmployee({ id: "ne" });

  function renderAccountFilters() {
    return renderHook(() =>
      useStaffFilters({
        employees: [LINKED, INVITED, NOT_INVITED, NO_EMAIL],
        focusAreas: [],
        certifications: [],
        roles: [],
        pendingInviteEmployeeIds: new Map([["in", {}]]),
      }),
    );
  }

  it.each([
    ["linked", "li"],
    ["invited", "in"],
    ["not_invited", "ni"],
    ["no_email", "ne"],
  ] as const)("keeps only %s people, as the Account column reads them", (state, id) => {
    const { result } = renderAccountFilters();

    act(() => result.current.setFilterAccount(state));

    expect(result.current.sorted.map((employee) => employee.id)).toEqual([id]);
    expect(result.current.activeFilterCount).toBe(1);
  });

  it("leaves the search box alone when filters are cleared", () => {
    const { result } = renderAccountFilters();

    act(() => {
      result.current.setSearchQuery("ni@");
      result.current.setFilterAccount("not_invited");
    });
    act(() => result.current.clearFilters());

    expect(result.current.filterAccount).toBe("all");
    expect(result.current.searchQuery).toBe("ni@");
  });
});
