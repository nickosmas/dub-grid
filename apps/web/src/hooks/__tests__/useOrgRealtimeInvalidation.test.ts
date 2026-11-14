import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  absorbMembershipViewStamp,
  getOrgRealtimeInvalidationKeys,
} from "../useOrgRealtimeInvalidation";
import { queryKeys } from "@/lib/query-keys";
import type { DirectoryPerson } from "@/types";

const ORG = "org-1";

describe("getOrgRealtimeInvalidationKeys", () => {
  it("invalidates invitations + directory + users + employeeCount when the invitations table changes", () => {
    expect(getOrgRealtimeInvalidationKeys(ORG, "invitations")).toEqual([
      [...queryKeys.org.invitations(ORG)],
      [...queryKeys.org.directory(ORG)],
      [...queryKeys.org.users(ORG)],
      [...queryKeys.org.employeeCount(ORG)],
    ]);
  });

  it("invalidates the recurring-shifts, shifts, and operations-report views on recurring_shifts changes", () => {
    expect(getOrgRealtimeInvalidationKeys(ORG, "recurring_shifts")).toEqual([
      [...queryKeys.recurringShifts.all(ORG)],
      [...queryKeys.shifts.all(ORG)],
      [...queryKeys.reports.operationsAll(ORG)],
    ]);
  });

  it("invalidates publish history + shifts + operations-report on publish_history changes", () => {
    expect(getOrgRealtimeInvalidationKeys(ORG, "publish_history")).toEqual([
      [...queryKeys.org.publishHistory(ORG)],
      [...queryKeys.shifts.all(ORG)],
      [...queryKeys.reports.operationsAll(ORG)],
    ]);
  });

  it("invalidates only the audit-log query on audit_log changes", () => {
    expect(getOrgRealtimeInvalidationKeys(ORG, "audit_log")).toEqual([
      [...queryKeys.org.auditLog(ORG)],
    ]);
  });

  it("invalidates the audit-log prefix, which covers person timelines, on role_change_log changes", () => {
    expect(getOrgRealtimeInvalidationKeys(ORG, "role_change_log")).toEqual([
      [...queryKeys.org.auditLog(ORG)],
    ]);
  });

  it("invalidates the pending people-change-requests queue on profile_change_requests changes", () => {
    expect(getOrgRealtimeInvalidationKeys(ORG, "profile_change_requests")).toEqual([
      [...queryKeys.org.peopleChangeRequests(ORG, "pending")],
    ]);
  });
});

describe("absorbMembershipViewStamp", () => {
  const person = {
    personId: "emp-1",
    source: "employee",
    userId: "user-1",
    phone: "555-0100",
    orgRole: "admin",
    managementDepartmentIds: [3, 4],
    managementDeptAdminIds: [4],
    membershipUpdatedAt: "2026-11-01T10:00:00.000000+00:00",
    adminPermissions: { canEditShifts: true, canViewReports: false },
  } as unknown as DirectoryPerson;

  const stamp = { userId: "user-1", updatedAt: "2026-11-13T09:00:00.123456+00:00" };

  function clientWithDirectory(directory: DirectoryPerson[] | undefined) {
    const client = new QueryClient();
    if (directory) client.setQueryData(queryKeys.org.directory(ORG), directory);
    return client;
  }

  it("moves the cached version forward for a stamp the database says changed nothing else", () => {
    const client = clientWithDirectory([person]);

    expect(
      absorbMembershipViewStamp(client, ORG, { eventType: "UPDATE", viewStamps: [stamp] }),
    ).toBe(true);
    expect(
      client.getQueryData<DirectoryPerson[]>(queryKeys.org.directory(ORG))?.[0]
        ?.membershipUpdatedAt,
    ).toBe(stamp.updatedAt);
  });

  it("refetches when it cannot absorb: no stamps, no cached directory, an unknown person, or a timestamp without an offset", () => {
    expect(
      absorbMembershipViewStamp(clientWithDirectory([person]), ORG, { eventType: "UPDATE" }),
    ).toBe(false);
    expect(
      absorbMembershipViewStamp(clientWithDirectory(undefined), ORG, {
        eventType: "UPDATE",
        viewStamps: [stamp],
      }),
    ).toBe(false);
    expect(
      absorbMembershipViewStamp(clientWithDirectory([{ ...person, userId: null }]), ORG, {
        eventType: "UPDATE",
        viewStamps: [stamp],
      }),
    ).toBe(false);
    expect(
      absorbMembershipViewStamp(clientWithDirectory([person]), ORG, {
        eventType: "UPDATE",
        viewStamps: [{ ...stamp, updatedAt: "2026-11-13T09:00:00.123456" }],
      }),
    ).toBe(false);
  });
});
