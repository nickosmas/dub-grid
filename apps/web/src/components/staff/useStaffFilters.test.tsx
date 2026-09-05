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
