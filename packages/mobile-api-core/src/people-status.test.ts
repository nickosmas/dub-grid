import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobilePerson, MobilePersonStatusUpdateBody } from "@dubgrid/contracts";
import type { Employee } from "@dubgrid/domain";
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

function run(current: Employee, body: Omit<MobilePersonStatusUpdateBody, "expectedVersion">) {
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
    insertAuditLog: vi.fn(async () => undefined),
    mapEmployeeToMobilePerson: vi.fn(
      (person: Employee) =>
        ({ id: person.id, status: person.status, awayUntil: person.awayUntil }) as MobilePerson,
    ),
    fetchActiveMembershipOrgRole: vi.fn(async () => null),
    countActiveSuperAdmins: vi.fn(async () => 2),
    archiveOrganizationMembership: vi.fn(async () => undefined),
    restoreOrganizationMembership: vi.fn(async () => undefined),
  };
  const result = updateMobilePersonStatus(
    {
      currentOrg: { id: ORG_ID, timezone: "America/Los_Angeles" },
      permissions: { canManageEmployees: true, isSuperAdmin: true },
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
