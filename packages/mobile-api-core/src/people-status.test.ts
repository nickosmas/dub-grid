import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobilePerson, MobilePersonStatusUpdateBody } from "@dubgrid/contracts";
import {
  OFFBOARD_OUT_OF_REACH_CODE,
  OFFBOARD_OUT_OF_REACH_MESSAGE,
  RESTORE_OUT_OF_REACH_MESSAGE,
  type Employee,
} from "@dubgrid/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateMobilePersonStatus } from "./people-status";

const ORG_ID = "org-1";
const EMP_ID = "emp-1";

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: EMP_ID,
    firstName: "Ana",
    lastName: "Torres",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    awayUntil: null,
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [7],
    phone: "",
    email: "",
    contactNotes: "",
    archivedAt: null,
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 1,
    ...overrides,
  };
}

function run(
  current: Employee,
  body: Omit<MobilePersonStatusUpdateBody, "expectedVersion">,
  {
    isSuperAdmin = true,
    targetRole = null,
  }: { isSuperAdmin?: boolean; targetRole?: string | null } = {},
) {
  const deps = {
    fetchEmployeeById: vi.fn(async () => current),
    updateEmployeeStatus: vi.fn(
      async (
        _client: SupabaseClient,
        input: {
          status: Employee["status"];
          awayUntil: string | null;
          awayAbsenceTypeId: number | null;
        },
      ) =>
        employee({
          status: input.status,
          awayUntil: input.awayUntil,
          awayAbsenceTypeId: input.awayAbsenceTypeId,
          version: 2,
        }),
    ),
    updateEmployeeReturnDate: vi.fn(
      async (
        _client: SupabaseClient,
        input: { awayUntil: string | null; awayAbsenceTypeId: number | null },
      ) =>
        employee({
          ...current,
          awayUntil: input.awayUntil,
          awayAbsenceTypeId: input.awayAbsenceTypeId,
          version: 2,
        }),
    ),
    updateEmployeeSuspension: vi.fn(
      async (
        _client: SupabaseClient,
        input: { suspended: boolean; suspendedUntil?: string | null },
      ) =>
        employee({
          ...current,
          suspendedAt: input.suspended ? "2026-10-27T05:00:00.000Z" : null,
          suspendedUntil: input.suspended ? (input.suspendedUntil ?? null) : null,
          version: 2,
        }),
    ),
    updateEmployeeSuspendedUntil: vi.fn(
      async (_client: SupabaseClient, input: { suspendedUntil: string | null }) =>
        employee({ ...current, suspendedUntil: input.suspendedUntil, version: 2 }),
    ),
    updateEmployeePlannedChange: vi.fn(
      async (
        _client: SupabaseClient,
        input: {
          plannedStatus: "away" | "removed" | "suspended" | "active" | null;
          plannedFrom: string | null;
          plannedUntil: string | null;
          plannedAbsenceTypeId: number | null;
        },
      ) =>
        employee({
          ...current,
          plannedStatus: input.plannedStatus,
          plannedFrom: input.plannedFrom,
          plannedUntil: input.plannedUntil,
          plannedAbsenceTypeId: input.plannedAbsenceTypeId,
          version: 2,
        }),
    ),
    endAccess: vi.fn(async () => undefined),
    insertAuditLog: vi.fn(async () => undefined),
    mapEmployeeToMobilePerson: vi.fn(
      (person: Employee) =>
        ({
          id: person.id,
          status: person.status,
          awayUntil: person.awayUntil,
          suspendedAt: person.suspendedAt ?? null,
        }) as MobilePerson,
    ),
    fetchActiveMembershipOrgRole: vi.fn(async () => null),
    countActiveSuperAdmins: vi.fn(async () => 2),
    fetchMembershipOrgRole: vi.fn(async () => targetRole),
    endOffboardedAccess: vi.fn(async () => undefined),
    reopenRestoredAccess: vi.fn(async () => undefined),
  };
  const result = updateMobilePersonStatus(
    {
      currentOrg: { id: ORG_ID, timezone: "America/Los_Angeles" },
      permissions: { canManageEmployees: true, isSuperAdmin },
      serviceClient: {} as SupabaseClient,
      user: { id: "manager-1", email: "manager@example.test" },
    },
    {
      employeeId: EMP_ID,
      body: { expectedVersion: 1, ...body },
      requestIp: null,
      userAgent: null,
    },
    deps,
  );
  return { deps, result };
}

describe("updateMobilePersonStatus with a return date", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Still Oct 26 in Los Angeles, already Oct 27 in UTC.
    vi.setSystemTime(new Date("2026-10-27T01:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks someone away until a day after the organization's today", async () => {
    const { deps, result } = run(employee(), { action: "deactivate", returnDate: "2026-10-27" });

    await expect(result).resolves.toMatchObject({
      kind: "updated",
      person: { status: "inactive", awayUntil: "2026-10-27" },
    });
    expect(deps.updateEmployeeStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "inactive", awayUntil: "2026-10-27" }),
    );
    expect(deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ details: expect.objectContaining({ awayUntil: "2026-10-27" }) }),
    );
  });

  it("refuses today as a return date, and changes nothing", async () => {
    const { deps, result } = run(employee(), { action: "deactivate", returnDate: "2026-10-26" });

    await expect(result).resolves.toEqual({
      kind: "invalid_return_date",
      error: "Choose a return date after today.",
      code: "RETURN_DATE_INVALID",
      status: 400,
    });
    expect(deps.updateEmployeeStatus).not.toHaveBeenCalled();
  });

  it("moves or clears an Away person's return date and keeps them Away", async () => {
    const away = employee({ status: "inactive", awayUntil: "2026-11-02" });
    const moved = run(away, { action: "setReturnDate", returnDate: "2026-11-09" });

    await expect(moved.result).resolves.toMatchObject({
      kind: "updated",
      person: { status: "inactive", awayUntil: "2026-11-09" },
    });
    expect(moved.deps.updateEmployeeStatus).not.toHaveBeenCalled();
    expect(moved.deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "employee.return_date_changed",
        details: {
          fromAwayUntil: "2026-11-02",
          toAwayUntil: "2026-11-09",
          changedFields: ["away_until"],
        },
      }),
    );

    const cleared = run(away, { action: "setReturnDate", returnDate: null });
    await expect(cleared.result).resolves.toMatchObject({ person: { awayUntil: null } });
  });

  it("refuses a return date for someone who isn't away", async () => {
    const { deps, result } = run(employee(), { action: "setReturnDate", returnDate: "2026-11-09" });

    await expect(result).resolves.toMatchObject({ kind: "invalid_return_date", code: "NOT_AWAY" });
    expect(deps.updateEmployeeReturnDate).not.toHaveBeenCalled();
  });

  it("marks someone away with an absence for their away days", async () => {
    const { deps, result } = run(employee(), {
      action: "deactivate",
      returnDate: "2026-11-02",
      absenceTypeId: 134,
    });

    await expect(result).resolves.toMatchObject({ kind: "updated" });
    expect(deps.updateEmployeeStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ awayUntil: "2026-11-02", awayAbsenceTypeId: 134 }),
    );
    expect(deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ details: expect.objectContaining({ awayAbsenceTypeId: 134 }) }),
    );
  });

  it("refuses an absence without a return date", async () => {
    const { deps, result } = run(employee(), {
      action: "deactivate",
      returnDate: null,
      absenceTypeId: 134,
    });

    await expect(result).resolves.toEqual({
      kind: "invalid_return_date",
      error: "Set a return date to fill their days with an absence.",
      code: "AWAY_ABSENCE_INVALID",
      status: 400,
    });
    expect(deps.updateEmployeeStatus).not.toHaveBeenCalled();
  });

  it("keeps the absence when only the date moves, and records a change of absence", async () => {
    const away = employee({ status: "inactive", awayUntil: "2026-11-02", awayAbsenceTypeId: 134 });

    const moved = run(away, { action: "setReturnDate", returnDate: "2026-11-09" });
    await expect(moved.result).resolves.toMatchObject({ kind: "updated" });
    expect(moved.deps.updateEmployeeReturnDate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ awayAbsenceTypeId: 134 }),
    );

    const changed = run(away, {
      action: "setReturnDate",
      returnDate: "2026-11-02",
      absenceTypeId: 135,
    });
    await expect(changed.result).resolves.toMatchObject({ kind: "updated" });
    expect(changed.deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        details: expect.objectContaining({ fromAwayAbsenceTypeId: 134, toAwayAbsenceTypeId: 135 }),
      }),
    );
  });

  it("answers 400 when the database refuses an absence from elsewhere", async () => {
    const { deps, result } = run(employee(), {
      action: "deactivate",
      returnDate: "2026-11-02",
      absenceTypeId: 999,
    });
    deps.updateEmployeeStatus.mockRejectedValueOnce({
      code: "23514",
      message: "Absence type not found in this organization",
    });

    await expect(result).resolves.toMatchObject({
      kind: "invalid_return_date",
      code: "AWAY_ABSENCE_INVALID",
      error: "Choose an absence your organization uses.",
    });
  });

  it("clears the return date on Mark active", async () => {
    const { deps } = run(employee({ status: "inactive", awayUntil: "2026-11-02" }), {
      action: "activate",
    });

    await vi.waitFor(() => expect(deps.updateEmployeeStatus).toHaveBeenCalled());
    expect(deps.updateEmployeeStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "active", awayUntil: null }),
    );
  });
});

describe("updateMobilePersonStatus suspending", () => {
  it("suspends someone, ends their access and records it", async () => {
    const { deps, result } = run(employee({ userId: "user-9" }), { action: "suspend" });

    await expect(result).resolves.toMatchObject({
      kind: "updated",
      person: { status: "active", suspendedAt: "2026-10-27T05:00:00.000Z" },
    });
    expect(deps.updateEmployeeSuspension).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ suspended: true, updatedBy: "manager-1" }),
    );
    expect(deps.endAccess).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-9",
      orgId: ORG_ID,
    });
    expect(deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "employee.suspended" }),
    );
  });

  it("refuses to suspend someone who isn't active", async () => {
    const { deps, result } = run(employee({ status: "inactive" }), { action: "suspend" });

    await expect(result).resolves.toMatchObject({
      kind: "invalid_status_change",
      code: "NOT_SUSPENDABLE",
    });
    expect(deps.updateEmployeeSuspension).not.toHaveBeenCalled();
  });

  it("refuses to suspend someone with no account, since there's no sign-in to stop", async () => {
    const { deps, result } = run(employee({ userId: null }), { action: "suspend" });

    await expect(result).resolves.toMatchObject({
      kind: "invalid_status_change",
      code: "NO_ACCOUNT",
    });
    expect(deps.updateEmployeeSuspension).not.toHaveBeenCalled();
  });

  it("refuses to suspend the only super admin", async () => {
    const { deps, result } = run(employee({ userId: "user-9" }), { action: "suspend" });
    deps.fetchActiveMembershipOrgRole.mockResolvedValue("super_admin" as never);
    deps.countActiveSuperAdmins.mockResolvedValue(1);

    await expect(result).resolves.toMatchObject({ kind: "cannot_remove_last_super_admin" });
    expect(deps.updateEmployeeSuspension).not.toHaveBeenCalled();
  });

  it("reinstates without ending anything, and refuses someone not suspended", async () => {
    const suspended = run(employee({ suspendedAt: "2026-10-26T00:00:00Z" }), {
      action: "reinstate",
    });
    await expect(suspended.result).resolves.toMatchObject({
      kind: "updated",
      person: { suspendedAt: null },
    });
    expect(suspended.deps.endAccess).not.toHaveBeenCalled();

    const active = run(employee(), { action: "reinstate" });
    await expect(active.result).resolves.toMatchObject({
      kind: "invalid_status_change",
      code: "NOT_SUSPENDED",
    });
  });
});

describe("updateMobilePersonStatus with a planned away (51g1)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 01:00 UTC on Oct 27 is still Oct 26 in Los Angeles.
    vi.setSystemTime(new Date("2026-10-27T01:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("plans an Away from a later date and keeps them Active", async () => {
    const { deps, result } = run(employee(), {
      action: "deactivate",
      startDate: "2026-11-10",
      returnDate: "2027-01-04",
      absenceTypeId: 134,
    });

    expect(await result).toMatchObject({ kind: "updated", status: 200 });
    expect(deps.updateEmployeeStatus).not.toHaveBeenCalled();
    expect(deps.updateEmployeePlannedChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        plannedStatus: "away",
        plannedFrom: "2026-11-10",
        plannedUntil: "2027-01-04",
        plannedAbsenceTypeId: 134,
        plannedNote: "",
      }),
    );
    expect(deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "employee.away_planned" }),
    );
  });

  it("starts the Away now when the start date is today", async () => {
    const { deps, result } = run(employee(), { action: "deactivate", startDate: "2026-10-26" });

    await result;
    expect(deps.updateEmployeeStatus).toHaveBeenCalled();
    expect(deps.updateEmployeePlannedChange).not.toHaveBeenCalled();
  });

  it.each([
    ["a past start", { startDate: "2026-10-01" }, "PLANNED_START_INVALID"],
    [
      "a return before the start",
      { startDate: "2026-11-10", returnDate: "2026-11-09" },
      "RETURN_DATE_INVALID",
    ],
  ])("refuses %s", async (_label, body, code) => {
    const { deps, result } = run(employee(), { action: "deactivate", ...body });

    expect(await result).toMatchObject({ status: 400, code });
    expect(deps.updateEmployeePlannedChange).not.toHaveBeenCalled();
  });

  it("refuses to plan for someone suspended, or to change a plan nobody has", async () => {
    expect(
      await run(employee({ suspendedAt: "2026-10-20T00:00:00Z" }), {
        action: "deactivate",
        startDate: "2026-11-10",
      }).result,
    ).toMatchObject({ code: "NOT_PLANNABLE" });
    expect(await run(employee(), { action: "cancelPlannedChange" }).result).toMatchObject({
      code: "NO_PLANNED_CHANGE",
    });
  });

  it("cancels a plan and logs it", async () => {
    const { deps, result } = run(
      employee({ plannedStatus: "away", plannedFrom: "2026-11-10", plannedUntil: null }),
      { action: "cancelPlannedChange" },
    );

    expect(await result).toMatchObject({ kind: "updated" });
    expect(deps.updateEmployeePlannedChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ plannedStatus: null, plannedFrom: null }),
    );
    expect(deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "employee.away_plan_cancelled" }),
    );
  });
});

describe("updateMobilePersonStatus with a last day (51g2)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 01:00 UTC on Oct 27 is still Oct 26 in Los Angeles.
    vi.setSystemTime(new Date("2026-10-27T01:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets a last day without offboarding them now", async () => {
    const { deps, result } = run(employee({ userId: "user-9" }), {
      action: "remove",
      lastDay: "2026-10-26",
      note: "Moving",
    });

    expect(await result).toMatchObject({ kind: "updated", status: 200 });
    expect(deps.updateEmployeeStatus).not.toHaveBeenCalled();
    expect(deps.endOffboardedAccess).not.toHaveBeenCalled();
    expect(deps.updateEmployeePlannedChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        plannedStatus: "removed",
        plannedFrom: "2026-10-27",
        plannedUntil: null,
        plannedAbsenceTypeId: null,
        plannedNote: "Moving",
      }),
    );
    expect(deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "employee.last_day_set",
        details: { lastDay: "2026-10-26", changedFields: ["planned_status"] },
      }),
    );
  });

  it("refuses a past or far last day, someone suspended, and the only super admin", async () => {
    expect(await run(employee(), { action: "remove", lastDay: "2026-10-25" }).result).toMatchObject(
      { status: 400, code: "LAST_DAY_INVALID" },
    );
    expect(await run(employee(), { action: "remove", lastDay: "2027-10-27" }).result).toMatchObject(
      { code: "LAST_DAY_INVALID" },
    );
    expect(
      await run(employee({ suspendedAt: "2026-10-20T00:00:00Z" }), {
        action: "remove",
        lastDay: "2026-11-08",
      }).result,
    ).toMatchObject({ code: "NOT_PLANNABLE" });

    const onlyOwner = run(employee({ userId: "user-9" }), {
      action: "remove",
      lastDay: "2026-11-08",
    });
    onlyOwner.deps.fetchActiveMembershipOrgRole.mockResolvedValue("super_admin" as never);
    onlyOwner.deps.countActiveSuperAdmins.mockResolvedValue(1);
    expect(await onlyOwner.result).toMatchObject({ kind: "cannot_remove_last_super_admin" });
    expect(onlyOwner.deps.updateEmployeePlannedChange).not.toHaveBeenCalled();
  });

  it("moves and cancels a last day, for someone not on the schedule too", async () => {
    const leaving = employee({
      focusAreaIds: [],
      plannedStatus: "removed",
      plannedFrom: "2026-11-09",
    });
    const moved = run(leaving, { action: "setPlannedChange", lastDay: "2026-11-12" });
    expect(await moved.result).toMatchObject({ kind: "updated" });
    expect(moved.deps.updateEmployeePlannedChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ plannedStatus: "removed", plannedFrom: "2026-11-13" }),
    );
    expect(moved.deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "employee.last_day_changed",
        details: expect.objectContaining({ fromLastDay: "2026-11-08", lastDay: "2026-11-12" }),
      }),
    );

    const cancelled = run(leaving, { action: "cancelPlannedChange" });
    expect(await cancelled.result).toMatchObject({ kind: "updated" });
    expect(cancelled.deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "employee.last_day_cancelled",
        details: expect.objectContaining({ lastDay: "2026-11-08" }),
      }),
    );
  });

  it("still offboards now with no last day", async () => {
    const { deps, result } = run(employee(), { action: "remove" });

    await result;
    expect(deps.updateEmployeeStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "removed" }),
    );
    expect(deps.updateEmployeePlannedChange).not.toHaveBeenCalled();
  });
});

describe("updateMobilePersonStatus with a suspension's start and end (51g3)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 01:00 UTC on Oct 27 is still Oct 26 in Los Angeles.
    vi.setSystemTime(new Date("2026-10-27T01:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("suspends now with an end date and records it", async () => {
    const { deps, result } = run(employee({ userId: "user-9" }), {
      action: "suspend",
      returnDate: "2026-11-20",
    });

    await expect(result).resolves.toMatchObject({ kind: "updated" });
    expect(deps.updateEmployeeSuspension).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ suspended: true, suspendedUntil: "2026-11-20" }),
    );
    expect(deps.endAccess).toHaveBeenCalled();
    expect(deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "employee.suspended",
        details: { suspendedUntil: "2026-11-20", changedFields: ["suspended_at"] },
      }),
    );
  });

  it("refuses an end date on or before today in the organization's timezone", async () => {
    const { deps, result } = run(employee({ userId: "user-9" }), {
      action: "suspend",
      returnDate: "2026-10-26",
    });

    await expect(result).resolves.toMatchObject({
      kind: "invalid_status_change",
      code: "SUSPENDED_UNTIL_INVALID",
    });
    expect(deps.updateEmployeeSuspension).not.toHaveBeenCalled();
  });

  it("plans a suspension for a later start without suspending them now", async () => {
    const { deps, result } = run(employee({ userId: "user-9" }), {
      action: "suspend",
      startDate: "2026-11-10",
      returnDate: "2026-11-20",
    });

    await expect(result).resolves.toMatchObject({ kind: "updated" });
    expect(deps.updateEmployeeSuspension).not.toHaveBeenCalled();
    expect(deps.endAccess).not.toHaveBeenCalled();
    expect(deps.updateEmployeePlannedChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        plannedStatus: "suspended",
        plannedFrom: "2026-11-10",
        plannedUntil: "2026-11-20",
        plannedAbsenceTypeId: null,
      }),
    );
    expect(deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "employee.suspension_planned" }),
    );
  });

  it("starts today's suspension now, even with a start date of today", async () => {
    const { deps, result } = run(employee({ userId: "user-9" }), {
      action: "suspend",
      startDate: "2026-10-26",
    });

    await expect(result).resolves.toMatchObject({ kind: "updated" });
    expect(deps.updateEmployeeSuspension).toHaveBeenCalled();
    expect(deps.updateEmployeePlannedChange).not.toHaveBeenCalled();
  });

  it("refuses a planned suspension with no account, an end before its start, or for the only super admin", async () => {
    const noAccount = run(employee({ userId: null }), {
      action: "suspend",
      startDate: "2026-11-10",
    });
    await expect(noAccount.result).resolves.toMatchObject({ code: "NO_ACCOUNT" });

    const early = run(employee({ userId: "user-9" }), {
      action: "suspend",
      startDate: "2026-11-10",
      returnDate: "2026-11-10",
    });
    await expect(early.result).resolves.toMatchObject({ code: "SUSPENDED_UNTIL_INVALID" });

    const only = run(employee({ userId: "user-9" }), {
      action: "suspend",
      startDate: "2026-11-10",
    });
    only.deps.fetchActiveMembershipOrgRole.mockResolvedValue("super_admin" as never);
    only.deps.countActiveSuperAdmins.mockResolvedValue(1);
    await expect(only.result).resolves.toMatchObject({ kind: "cannot_remove_last_super_admin" });
    expect(only.deps.updateEmployeePlannedChange).not.toHaveBeenCalled();
  });

  it("moves and cancels a planned suspension, for someone not on the schedule too", async () => {
    const planned = employee({
      userId: "user-9",
      focusAreaIds: [],
      plannedStatus: "suspended",
      plannedFrom: "2026-11-10",
      plannedUntil: null,
    });
    const moved = run(planned, {
      action: "setPlannedChange",
      startDate: "2026-11-12",
      returnDate: "2026-11-30",
    });
    await expect(moved.result).resolves.toMatchObject({ kind: "updated" });
    expect(moved.deps.updateEmployeePlannedChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        plannedStatus: "suspended",
        plannedFrom: "2026-11-12",
        plannedUntil: "2026-11-30",
      }),
    );
    expect(moved.deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "employee.suspension_plan_changed" }),
    );

    const cancelled = run(planned, { action: "cancelPlannedChange" });
    await expect(cancelled.result).resolves.toMatchObject({ kind: "updated" });
    expect(cancelled.deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "employee.suspension_plan_cancelled" }),
    );
  });

  it("sets and clears a suspended person's end date, and refuses someone not suspended", async () => {
    const suspended = employee({
      userId: "user-9",
      suspendedAt: "2026-10-20T00:00:00Z",
      suspendedUntil: "2026-11-20",
    });
    const cleared = run(suspended, { action: "setSuspendedUntil", returnDate: null });
    await expect(cleared.result).resolves.toMatchObject({ kind: "updated" });
    expect(cleared.deps.updateEmployeeSuspendedUntil).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ suspendedUntil: null }),
    );
    expect(cleared.deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "employee.suspension_end_changed",
        details: {
          fromSuspendedUntil: "2026-11-20",
          toSuspendedUntil: null,
          changedFields: ["suspended_until"],
        },
      }),
    );
    expect(cleared.deps.endAccess).not.toHaveBeenCalled();

    const active = run(employee(), { action: "setSuspendedUntil", returnDate: "2026-11-20" });
    await expect(active.result).resolves.toMatchObject({ code: "NOT_SUSPENDED" });
  });
});

describe("updateMobilePersonStatus offboarding and restoring (51k)", () => {
  it("ends access whoever offboards them, an Admin included", async () => {
    const { deps, result } = run(
      employee({ userId: "user-9" }),
      { action: "remove" },
      { isSuperAdmin: false, targetRole: "admin" },
    );

    expect(await result).toMatchObject({ kind: "updated", status: 200 });
    expect(deps.endOffboardedAccess).toHaveBeenCalledWith(expect.anything(), {
      orgId: ORG_ID,
      empId: EMP_ID,
      userId: "user-9",
      actorId: "manager-1",
      at: expect.any(String),
    });
  });

  it("reopens access on Restore, and not on Mark active from Away", async () => {
    const restored = run(
      employee({ userId: "user-9", status: "removed", archivedAt: "2026-10-01T00:00:00Z" }),
      { action: "activate" },
      { isSuperAdmin: false, targetRole: "user" },
    );
    expect(await restored.result).toMatchObject({ kind: "updated" });
    expect(restored.deps.reopenRestoredAccess).toHaveBeenCalledWith(expect.anything(), {
      orgId: ORG_ID,
      empId: EMP_ID,
      userId: "user-9",
    });

    const back = run(employee({ userId: "user-9", status: "inactive" }), { action: "activate" });
    expect(await back.result).toMatchObject({ kind: "updated" });
    expect(back.deps.reopenRestoredAccess).not.toHaveBeenCalled();
  });

  it("refuses an Admin offboarding, planning a last day for or restoring a Super Admin", async () => {
    const offboard = run(
      employee({ userId: "user-9" }),
      { action: "remove" },
      { isSuperAdmin: false, targetRole: "super_admin" },
    );
    expect(await offboard.result).toEqual({
      kind: "out_of_reach",
      error: OFFBOARD_OUT_OF_REACH_MESSAGE,
      code: OFFBOARD_OUT_OF_REACH_CODE,
      status: 403,
    });
    expect(offboard.deps.updateEmployeeStatus).not.toHaveBeenCalled();
    expect(offboard.deps.endOffboardedAccess).not.toHaveBeenCalled();

    const lastDay = run(
      employee({ userId: "user-9" }),
      { action: "remove", lastDay: "2026-12-01" },
      { isSuperAdmin: false, targetRole: "super_admin" },
    );
    expect(await lastDay.result).toMatchObject({ kind: "out_of_reach" });
    expect(lastDay.deps.updateEmployeePlannedChange).not.toHaveBeenCalled();

    const restore = run(
      employee({ userId: "user-9", status: "removed", archivedAt: "2026-10-01T00:00:00Z" }),
      { action: "activate" },
      { isSuperAdmin: false, targetRole: "super_admin" },
    );
    expect(await restore.result).toMatchObject({
      kind: "out_of_reach",
      error: RESTORE_OUT_OF_REACH_MESSAGE,
    });
    expect(restore.deps.reopenRestoredAccess).not.toHaveBeenCalled();
  });

  it("lets a Super Admin offboard without reading the role", async () => {
    const { deps, result } = run(employee({ userId: "user-9" }), { action: "remove" });

    expect(await result).toMatchObject({ kind: "updated" });
    expect(deps.fetchMembershipOrgRole).not.toHaveBeenCalled();
  });
});

describe("updateMobilePersonStatus with a planned return (51l)", () => {
  const offboarded = (overrides: Partial<Employee> = {}) =>
    employee({
      userId: "user-9",
      status: "removed",
      archivedAt: "2026-10-01T00:00:00Z",
      ...overrides,
    });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 01:00 UTC on Oct 27 is still Oct 26 in Los Angeles.
    vi.setSystemTime(new Date("2026-10-27T01:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("plans a return without restoring them now", async () => {
    const { deps, result } = run(offboarded(), { action: "activate", startDate: "2026-11-10" });

    expect(await result).toMatchObject({ kind: "updated", status: 200 });
    expect(deps.updateEmployeeStatus).not.toHaveBeenCalled();
    expect(deps.reopenRestoredAccess).not.toHaveBeenCalled();
    expect(deps.updateEmployeePlannedChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        plannedStatus: "active",
        plannedFrom: "2026-11-10",
        plannedUntil: null,
        plannedAbsenceTypeId: null,
      }),
    );
    expect(deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "employee.restore_planned",
        details: { returnDate: "2026-11-10", changedFields: ["planned_status"] },
      }),
    );
  });

  it("restores now with a start of today, and refuses a far start", async () => {
    const now = run(offboarded(), { action: "activate", startDate: "2026-10-26" });
    expect(await now.result).toMatchObject({ kind: "updated" });
    expect(now.deps.reopenRestoredAccess).toHaveBeenCalled();
    expect(now.deps.updateEmployeePlannedChange).not.toHaveBeenCalled();

    const far = run(offboarded(), { action: "activate", startDate: "2027-10-27" });
    expect(await far.result).toMatchObject({ status: 400, code: "PLANNED_START_INVALID" });
    expect(far.deps.updateEmployeePlannedChange).not.toHaveBeenCalled();
  });

  it("moves and cancels a planned return", async () => {
    const returning = offboarded({ plannedStatus: "active", plannedFrom: "2026-11-10" });
    const moved = run(returning, { action: "setPlannedChange", startDate: "2026-11-12" });
    expect(await moved.result).toMatchObject({ kind: "updated" });
    expect(moved.deps.updateEmployeePlannedChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ plannedStatus: "active", plannedFrom: "2026-11-12" }),
    );
    expect(moved.deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "employee.restore_plan_changed",
        details: expect.objectContaining({
          fromReturnDate: "2026-11-10",
          returnDate: "2026-11-12",
        }),
      }),
    );

    const cancelled = run(returning, { action: "cancelPlannedChange" });
    expect(await cancelled.result).toMatchObject({ kind: "updated" });
    expect(cancelled.deps.updateEmployeePlannedChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ plannedStatus: null }),
    );
    expect(cancelled.deps.insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "employee.restore_plan_cancelled",
        details: expect.objectContaining({ returnDate: "2026-11-10" }),
      }),
    );
  });

  it("refuses an Admin planning, moving or cancelling a Super Admin's return", async () => {
    for (const [current, body] of [
      [offboarded(), { action: "activate", startDate: "2026-11-10" }],
      [
        offboarded({ plannedStatus: "active", plannedFrom: "2026-11-10" }),
        { action: "setPlannedChange", startDate: "2026-11-12" },
      ],
      [
        offboarded({ plannedStatus: "active", plannedFrom: "2026-11-10" }),
        { action: "cancelPlannedChange" },
      ],
    ] as const) {
      const { deps, result } = run(current, body, {
        isSuperAdmin: false,
        targetRole: "super_admin",
      });
      expect(await result).toMatchObject({
        kind: "out_of_reach",
        error: RESTORE_OUT_OF_REACH_MESSAGE,
      });
      expect(deps.updateEmployeePlannedChange).not.toHaveBeenCalled();
    }
  });
});
