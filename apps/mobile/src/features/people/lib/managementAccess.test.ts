import { describe, expect, it } from "vitest";
import {
  managementAccessBaseline,
  managementAccessDraftChanged,
  type ManagementAccessSubject,
} from "./managementAccess";

function subject(overrides: Partial<ManagementAccessSubject> = {}): ManagementAccessSubject {
  return {
    id: "emp-1",
    firstName: "Mina",
    lastName: "Diaz",
    email: "mina@dubgrid.com",
    orgRole: "admin",
    userId: "user-1",
    membershipUpdatedAt: null,
    managementDepartmentIds: [9, 10],
    pendingInvitation: null,
    ...overrides,
  };
}

describe("managementAccessBaseline", () => {
  it("copies the departments, so a later change to the record can't move it", () => {
    const person = subject();
    const baseline = managementAccessBaseline(person);
    person.managementDepartmentIds.push(11);

    expect(baseline.managementDepartmentIds).toEqual([9, 10]);
  });

  it("falls back to the invitation's role, then User", () => {
    expect(
      managementAccessBaseline(
        subject({
          orgRole: null,
          pendingInvitation: {
            id: "invite-1",
            email: "mina@dubgrid.com",
            expiresAt: "2099-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            roleToAssign: "admin",
          },
        }),
      ).orgRole,
    ).toBe("admin");
    expect(managementAccessBaseline(subject({ orgRole: null })).orgRole).toBe("user");
  });
});

describe("managementAccessDraftChanged", () => {
  const baseline = { orgRole: "admin" as const, managementDepartmentIds: [9, 10] };

  it("reads departments picked in another order as unchanged", () => {
    expect(
      managementAccessDraftChanged({ ...baseline, managementDepartmentIds: [10, 9] }, baseline),
    ).toBe(false);
  });

  it("sees a swapped department and a changed role", () => {
    expect(
      managementAccessDraftChanged({ ...baseline, managementDepartmentIds: [9, 11] }, baseline),
    ).toBe(true);
    expect(managementAccessDraftChanged({ ...baseline, orgRole: "user" }, baseline)).toBe(true);
  });
});
