import { describe, expect, it } from "vitest";
import { getOrgRealtimeInvalidationKeys } from "../useOrgRealtimeInvalidation";
import { queryKeys } from "@/lib/query-keys";

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

  it("invalidates the recurring-shifts and shifts views on recurring_shifts changes", () => {
    expect(getOrgRealtimeInvalidationKeys(ORG, "recurring_shifts")).toEqual([
      [...queryKeys.recurringShifts.all(ORG)],
      [...queryKeys.shifts.all(ORG)],
    ]);
  });

  it("invalidates publish history + shifts on publish_history changes", () => {
    expect(getOrgRealtimeInvalidationKeys(ORG, "publish_history")).toEqual([
      [...queryKeys.org.publishHistory(ORG)],
      [...queryKeys.shifts.all(ORG)],
    ]);
  });

  it("invalidates only the audit-log query on audit_log changes", () => {
    expect(getOrgRealtimeInvalidationKeys(ORG, "audit_log")).toEqual([
      [...queryKeys.org.auditLog(ORG)],
    ]);
  });

  it("invalidates the pending people-change-requests queue on profile_change_requests changes", () => {
    expect(
      getOrgRealtimeInvalidationKeys(ORG, "profile_change_requests"),
    ).toEqual([[...queryKeys.org.peopleChangeRequests(ORG, "pending")]]);
  });
});
