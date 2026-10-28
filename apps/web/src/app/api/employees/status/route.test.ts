import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_ERRORS } from "@dubgrid/client-errors";

const requireAuthenticatedUser = vi.fn();
const validateCsrfOrigin = vi.fn();
const checkRateLimit = vi.fn();
const resolveEffectiveOrgId = vi.fn();
const canManageEmployees = vi.fn();
const membershipMaybeSingle = vi.fn();
const profileSingle = vi.fn();
const employeeCurrentSingle = vi.fn();
const employeeUpdateMaybeSingle = vi.fn();
const employeeUpdate = vi.fn();
const membershipRestoreUpdate = vi.fn();
const membershipArchiveUpdate = vi.fn();
const targetMembershipMaybeSingle = vi.fn();
const superAdminCountIs = vi.fn();
const auditInsert = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const revokeAllUserSessions = vi.fn();
const orgTimezoneSingle = vi.fn();
const endUserSessions = vi.fn();
const disableMobilePushTokensForOrg = vi.fn();

const scheduleSuspensionNotice = vi.fn();
vi.mock("@/features/employees/server/suspension-notice", () => ({
  scheduleSuspensionNotice: (...args: unknown[]) => scheduleSuspensionNotice(...args),
}));
vi.mock("@/lib/auth/revocation", () => ({
  revokeAllUserSessions: (...args: unknown[]) => revokeAllUserSessions(...args),
  endUserSessions: (...args: unknown[]) => endUserSessions(...args),
}));

vi.mock("@dubgrid/data-access", () => ({
  disableMobilePushTokensForOrg: (...args: unknown[]) => disableMobilePushTokensForOrg(...args),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn() },
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/app/api/shared/permissions", () => ({
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
}));

vi.mock("@/app/api/employees/shared", () => ({
  canManageEmployees: (...args: unknown[]) => canManageEmployees(...args),
}));

const cacheDel = vi.fn();
vi.mock("@/lib/cache", () => ({
  cacheDel: (...args: unknown[]) => cacheDel(...args),
  CacheKey: {
    orgUsers: (orgId: string) => `dg:org:${orgId}:orgUsers`,
    orgDirectory: (orgId: string) => `dg:org:${orgId}:orgDirectory`,
    employees: (orgId: string) => `dg:org:${orgId}:employees`,
    allUsers: () => "dg:gm:allUsers",
  },
  cacheThrough: (_key: string, _ttl: number, fetcher: () => unknown) => fetcher(),
  TTL: { MODERATE: 60 },
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "organization_memberships") {
        return {
          // Dispatches on the select() columns, since a single request can
          // issue up to three distinct organization_memberships selects: the
          // permission-check ("org_role, admin_permissions"), the
          // last-super-admin target lookup ("org_role"), and its count
          // query ("*", { count }).
          select: vi.fn((cols: string, opts?: { count?: string }) => {
            if (opts?.count) {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: superAdminCountIs,
                  })),
                })),
              };
            }
            if (cols === "org_role") {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: vi.fn(() => ({
                      maybeSingle: targetMembershipMaybeSingle,
                    })),
                  })),
                })),
              };
            }
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({ maybeSingle: membershipMaybeSingle })),
                })),
              })),
            };
          }),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: membershipRestoreUpdate,
                is: membershipArchiveUpdate,
              })),
            })),
          })),
        };
      }

      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: profileSingle,
            })),
          })),
        };
      }

      if (table === "employees") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: employeeCurrentSingle,
              })),
            })),
          })),
          update: employeeUpdate.mockImplementation(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    maybeSingle: employeeUpdateMaybeSingle,
                  })),
                })),
              })),
            })),
          })),
        };
      }

      if (table === "audit_log") {
        return { insert: auditInsert };
      }

      if (table === "organizations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: orgTimezoneSingle })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { POST } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const EMP_ID = "33333333-3333-4333-8333-333333333333";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";

function makeRequest(action: "deactivate" | "remove" | "activate" = "deactivate") {
  return new NextRequest("http://localhost/api/employees/status", {
    method: "POST",
    body: JSON.stringify({
      empId: EMP_ID,
      orgId: ORG_ID,
      action,
      expectedVersion: 1,
    }),
  });
}

describe("POST /api/employees/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUser.mockResolvedValue({ user: { id: USER_ID } });
    requireSensitiveActionAuth.mockResolvedValue({ user: { id: USER_ID } });
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    validateCsrfOrigin.mockReturnValue(null);
    resolveEffectiveOrgId.mockResolvedValue(ORG_ID);
    canManageEmployees.mockResolvedValue(true);
  });

  it("denies a caller canManageEmployees refuses", async () => {
    canManageEmployees.mockResolvedValue(false);
    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "admin", admin_permissions: { canManageEmployees: true } },
      error: null,
    });
    profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });

    const response = await POST(makeRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES });
  });

  it("lets a super_admin past the permission gate", async () => {
    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "super_admin", admin_permissions: null },
      error: null,
    });
    profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });

    const response = await POST(makeRequest());

    // The employees row-fetch mock isn't configured with a resolved value in
    // this test, so getting past the 403 surfaces as a 500 rather than a
    // successful update. That's enough to prove the gate itself did not block them.
    expect(response.status).not.toBe(403);
  });

  it("lets a gridmaster past the permission gate", async () => {
    membershipMaybeSingle.mockResolvedValue({ data: null, error: null });
    profileSingle.mockResolvedValue({ data: { platform_role: "gridmaster" }, error: null });

    const response = await POST(makeRequest());

    expect(response.status).not.toBe(403);
  });

  it("asks a Gridmaster for fresh proof before taking a staff record out, and changes nothing without it (F-96)", async () => {
    membershipMaybeSingle.mockResolvedValue({ data: null, error: null });
    profileSingle.mockResolvedValue({ data: { platform_role: "gridmaster" }, error: null });
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: NextResponse.json({ code: "STEP_UP_REQUIRED" }, { status: 403 }),
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(403);
    expect(requireSensitiveActionAuth).toHaveBeenCalledTimes(1);
    expect(employeeCurrentSingle).not.toHaveBeenCalled();
    expect(employeeUpdateMaybeSingle).not.toHaveBeenCalled();
  });

  it("asks a Gridmaster for fresh proof before a removal too (F-103)", async () => {
    membershipMaybeSingle.mockResolvedValue({ data: null, error: null });
    profileSingle.mockResolvedValue({ data: { platform_role: "gridmaster" }, error: null });
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: NextResponse.json({ code: "STEP_UP_REQUIRED" }, { status: 403 }),
    });

    const response = await POST(makeRequest("remove"));

    expect(response.status).toBe(403);
    expect(employeeCurrentSingle).not.toHaveBeenCalled();
    expect(employeeUpdateMaybeSingle).not.toHaveBeenCalled();
  });

  it("never asks a Gridmaster for proof to reactivate someone (F-103)", async () => {
    membershipMaybeSingle.mockResolvedValue({ data: null, error: null });
    profileSingle.mockResolvedValue({ data: { platform_role: "gridmaster" }, error: null });

    await POST(makeRequest("activate"));

    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
    expect(employeeCurrentSingle).toHaveBeenCalled();
  });

  it("lets a Gridmaster with fresh proof go on to the staff record (F-103)", async () => {
    membershipMaybeSingle.mockResolvedValue({ data: null, error: null });
    profileSingle.mockResolvedValue({ data: { platform_role: "gridmaster" }, error: null });

    await POST(makeRequest("deactivate"));

    expect(requireSensitiveActionAuth).toHaveBeenCalledTimes(1);
    expect(employeeCurrentSingle).toHaveBeenCalled();
  });

  it("never asks an organization admin for fresh proof (F-96)", async () => {
    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "super_admin", admin_permissions: null },
      error: null,
    });
    profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });

    await POST(makeRequest());

    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
  });

  describe("marking inactive", () => {
    const EMPLOYEE_USER_ID = "66666666-6666-4666-8666-666666666666";

    function arrange(focusAreaIds: number[]) {
      membershipMaybeSingle.mockResolvedValue({
        data: { org_role: "super_admin", admin_permissions: null },
        error: null,
      });
      profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });
      const row = {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "active",
        version: 1,
        user_id: EMPLOYEE_USER_ID,
        focus_area_ids: focusAreaIds,
      };
      employeeCurrentSingle.mockResolvedValue({ data: row, error: null });
      employeeUpdateMaybeSingle.mockResolvedValue({
        data: { ...row, status: "inactive", version: 2 },
        error: null,
      });
      auditInsert.mockResolvedValue({ error: null });
    }

    it("keeps the person signed in", async () => {
      arrange([7]);

      const response = await POST(makeRequest("deactivate"));

      expect(response.status).toBe(200);
      expect(employeeUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "inactive" }));
      expect(revokeAllUserSessions).not.toHaveBeenCalled();
    });

    it("refuses someone who isn't on the schedule, and changes nothing", async () => {
      arrange([]);

      const response = await POST(makeRequest("deactivate"));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Only someone on the schedule can be marked away.",
        code: "NOT_ON_SCHEDULE",
      });
      expect(employeeUpdate).not.toHaveBeenCalled();
    });

    it("still signs a removed person out everywhere", async () => {
      arrange([]);
      employeeUpdateMaybeSingle.mockResolvedValue({
        data: {
          id: EMP_ID,
          org_id: ORG_ID,
          status: "removed",
          version: 2,
          user_id: EMPLOYEE_USER_ID,
        },
        error: null,
      });
      targetMembershipMaybeSingle.mockResolvedValue({ data: { org_role: "user" }, error: null });
      membershipArchiveUpdate.mockResolvedValue({ error: null });

      const response = await POST(makeRequest("remove"));

      expect(response.status).toBe(200);
      expect(revokeAllUserSessions).toHaveBeenCalledWith(EMPLOYEE_USER_ID);
    });
  });

  describe("a return date", () => {
    const TODAY = "2026-10-26";

    function arrange(
      status: "active" | "inactive",
      awayUntil: string | null = null,
      awayAbsenceTypeId: number | null = null,
      extra: Record<string, unknown> = {},
    ) {
      vi.useFakeTimers({ toFake: ["Date"] });
      // 01:00 UTC on Oct 27 is still Oct 26 in Los Angeles.
      vi.setSystemTime(new Date("2026-10-27T01:00:00.000Z"));
      membershipMaybeSingle.mockResolvedValue({
        data: { org_role: "super_admin", admin_permissions: null },
        error: null,
      });
      profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });
      orgTimezoneSingle.mockResolvedValue({
        data: { timezone: "America/Los_Angeles" },
        error: null,
      });
      const row = {
        id: EMP_ID,
        org_id: ORG_ID,
        status,
        away_until: awayUntil,
        away_absence_type_id: awayAbsenceTypeId,
        version: 1,
        user_id: null,
        focus_area_ids: [7],
        ...extra,
      };
      employeeCurrentSingle.mockResolvedValue({ data: row, error: null });
      employeeUpdateMaybeSingle.mockImplementation(async () => ({
        data: {
          ...row,
          ...(employeeUpdate.mock.calls.at(-1)?.[0] as Record<string, unknown>),
        },
        error: null,
      }));
      auditInsert.mockResolvedValue({ error: null });
    }

    function post(body: Record<string, unknown>) {
      return POST(
        new NextRequest("http://localhost/api/employees/status", {
          method: "POST",
          body: JSON.stringify({ empId: EMP_ID, orgId: ORG_ID, expectedVersion: 1, ...body }),
        }),
      );
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it("marks someone away until a day after the organization's today", async () => {
      arrange("active");

      const response = await post({ action: "deactivate", returnDate: "2026-10-27" });

      expect(response.status).toBe(200);
      expect(employeeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "inactive", away_until: "2026-10-27" }),
      );
      expect((await response.json()).employee.awayUntil).toBe("2026-10-27");
      expect(auditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "employee.deactivated",
          details: expect.objectContaining({ awayUntil: "2026-10-27" }),
        }),
      );
    });

    it("marks someone away with no return date as before", async () => {
      arrange("active");

      const response = await post({ action: "deactivate" });

      expect(response.status).toBe(200);
      expect(employeeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "inactive", away_until: null }),
      );
      expect(orgTimezoneSingle).not.toHaveBeenCalled();
    });

    it.each([TODAY, "2026-10-01"])(
      "refuses %s as a return date, and changes nothing",
      async (date) => {
        arrange("active");

        const response = await post({ action: "deactivate", returnDate: date });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
          error: "Choose a return date after today.",
          code: "RETURN_DATE_INVALID",
        });
        expect(employeeUpdate).not.toHaveBeenCalled();
      },
    );

    it("refuses a malformed return date", async () => {
      arrange("active");

      const response = await post({ action: "deactivate", returnDate: "Jan 4" });

      expect(response.status).toBe(400);
      expect(employeeUpdate).not.toHaveBeenCalled();
    });

    it("moves an Away person's return date without touching their status", async () => {
      arrange("inactive", "2026-11-02");

      const response = await post({ action: "setReturnDate", returnDate: "2026-11-09" });

      expect(response.status).toBe(200);
      const update = employeeUpdate.mock.calls[0][0] as Record<string, unknown>;
      expect(update).toMatchObject({ away_until: "2026-11-09", updated_by: USER_ID, version: 2 });
      expect(update).not.toHaveProperty("status");
      expect(update).not.toHaveProperty("status_changed_at");
      expect(auditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "employee.return_date_changed",
          details: {
            fromAwayUntil: "2026-11-02",
            toAwayUntil: "2026-11-09",
            changedFields: ["away_until"],
          },
        }),
      );
    });

    it("clears an Away person's return date", async () => {
      arrange("inactive", "2026-11-02");

      const response = await post({ action: "setReturnDate", returnDate: null });

      expect(response.status).toBe(200);
      expect(employeeUpdate).toHaveBeenCalledWith(expect.objectContaining({ away_until: null }));
      expect(orgTimezoneSingle).not.toHaveBeenCalled();
    });

    it("refuses a return date for someone who isn't away", async () => {
      arrange("active");

      const response = await post({ action: "setReturnDate", returnDate: "2026-11-09" });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Only someone who is away can have a return date.",
        code: "NOT_AWAY",
      });
      expect(employeeUpdate).not.toHaveBeenCalled();
    });

    it("marks someone away with an absence for their away days", async () => {
      arrange("active");

      const response = await post({
        action: "deactivate",
        returnDate: "2026-11-02",
        absenceTypeId: 134,
      });

      expect(response.status).toBe(200);
      expect(employeeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ away_until: "2026-11-02", away_absence_type_id: 134 }),
      );
      expect((await response.json()).employee.awayAbsenceTypeId).toBe(134);
      expect(auditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({ awayAbsenceTypeId: 134 }),
        }),
      );
    });

    it("plans an Away from a later date without changing their status", async () => {
      arrange("active");

      const response = await post({
        action: "deactivate",
        startDate: "2026-11-10",
        returnDate: "2027-01-04",
        absenceTypeId: 134,
        note: "Leave",
      });

      expect(response.status).toBe(200);
      const update = employeeUpdate.mock.calls[0][0] as Record<string, unknown>;
      expect(update).toMatchObject({
        planned_status: "away",
        planned_from: "2026-11-10",
        planned_until: "2027-01-04",
        planned_absence_type_id: 134,
        planned_note: "Leave",
        planned_by: USER_ID,
      });
      expect(update).not.toHaveProperty("status");
      expect(update).not.toHaveProperty("status_changed_at");
      expect(auditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "employee.away_planned",
          details: expect.objectContaining({
            plannedFrom: "2026-11-10",
            plannedUntil: "2027-01-04",
            changedFields: ["planned_status"],
          }),
        }),
      );
    });

    it("starts the Away now when the start date is today", async () => {
      arrange("active");

      await post({ action: "deactivate", startDate: TODAY });

      expect(employeeUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "inactive" }));
    });

    it.each([
      ["yesterday", { startDate: "2026-10-25" }, "PLANNED_START_INVALID"],
      ["more than a year ahead", { startDate: "2027-10-27" }, "PLANNED_START_INVALID"],
      [
        "a return before the start",
        { startDate: "2026-11-10", returnDate: "2026-11-10" },
        "RETURN_DATE_INVALID",
      ],
      [
        "an absence with no return date",
        { startDate: "2026-11-10", absenceTypeId: 134 },
        "AWAY_ABSENCE_INVALID",
      ],
    ])("refuses a plan with %s", async (_label, body, code) => {
      arrange("active");

      const response = await post({ action: "deactivate", ...body });

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe(code);
      expect(employeeUpdate).not.toHaveBeenCalled();
    });

    it("refuses to plan an Away for someone suspended", async () => {
      arrange("active", null, null, { suspended_at: "2026-10-20T00:00:00Z" });

      const response = await post({ action: "deactivate", startDate: "2026-11-10" });

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("NOT_PLANNABLE");
    });

    it("moves a planned Away and cancels one", async () => {
      const planned = {
        planned_status: "away",
        planned_from: "2026-11-10",
        planned_until: "2027-01-04",
      };
      arrange("active", null, null, planned);

      const moved = await post({
        action: "setPlannedChange",
        startDate: "2026-11-12",
        returnDate: "2027-01-04",
      });
      expect(moved.status).toBe(200);
      expect(employeeUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ planned_from: "2026-11-12", planned_until: "2027-01-04" }),
      );
      expect(employeeUpdate.mock.calls.at(-1)?.[0]).not.toHaveProperty("planned_note");
      expect(auditInsert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: "employee.away_plan_changed",
          details: expect.objectContaining({ fromPlannedFrom: "2026-11-10" }),
        }),
      );

      arrange("active", null, null, planned);
      const cancelled = await post({ action: "cancelPlannedChange" });
      expect(cancelled.status).toBe(200);
      expect(employeeUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ planned_status: null }),
      );
      expect(employeeUpdate.mock.calls.at(-1)?.[0]).not.toHaveProperty("status_changed_at");
      expect(auditInsert).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: "employee.away_plan_cancelled" }),
      );
    });

    it.each(["setPlannedChange", "cancelPlannedChange"])(
      "refuses %s when nothing is planned",
      async (action) => {
        arrange("active");

        const response = await post({ action, startDate: "2026-11-10" });

        expect(response.status).toBe(400);
        expect((await response.json()).code).toBe("NO_PLANNED_CHANGE");
      },
    );

    it("sets a last day without offboarding them now (51g2)", async () => {
      arrange("active", null, null, { user_id: "55555555-5555-4555-8555-555555555555" });
      targetMembershipMaybeSingle.mockResolvedValue({ data: { org_role: "user" }, error: null });

      const response = await post({ action: "remove", lastDay: TODAY, note: "Moving" });

      expect(response.status).toBe(200);
      const update = employeeUpdate.mock.calls[0][0] as Record<string, unknown>;
      expect(update).toMatchObject({
        planned_status: "removed",
        planned_from: "2026-10-27",
        planned_until: null,
        planned_absence_type_id: null,
        planned_note: "Moving",
        planned_by: USER_ID,
      });
      expect(update).not.toHaveProperty("status");
      expect(update).not.toHaveProperty("archived_at");
      expect(update).not.toHaveProperty("status_changed_at");
      expect(revokeAllUserSessions).not.toHaveBeenCalled();
      expect(membershipArchiveUpdate).not.toHaveBeenCalled();
      expect(auditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "employee.last_day_set",
          details: { lastDay: TODAY, changedFields: ["planned_status"] },
        }),
      );
    });

    it("sets a last day for someone not on the schedule", async () => {
      arrange("active", null, null, { focus_area_ids: [] });

      const response = await post({ action: "remove", lastDay: "2026-11-08" });

      expect(response.status).toBe(200);
    });

    it.each([
      ["yesterday", "2026-10-25"],
      ["more than a year ahead", "2027-10-27"],
    ])("refuses a last day %s", async (_label, lastDay) => {
      arrange("active");

      const response = await post({ action: "remove", lastDay });

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("LAST_DAY_INVALID");
      expect(employeeUpdate).not.toHaveBeenCalled();
    });

    it("refuses a last day for someone suspended or away", async () => {
      for (const [status, extra] of [
        ["active", { suspended_at: "2026-10-20T00:00:00Z" }],
        ["inactive", {}],
      ] as const) {
        arrange(status, null, null, extra);
        const response = await post({ action: "remove", lastDay: "2026-11-08" });
        expect((await response.json()).code).toBe("NOT_PLANNABLE");
      }
      expect(employeeUpdate).not.toHaveBeenCalled();
    });

    it("moves a last day and cancels one", async () => {
      const leaving = { planned_status: "removed", planned_from: "2026-11-09" };
      arrange("active", null, null, leaving);

      const moved = await post({ action: "setPlannedChange", lastDay: "2026-11-12" });
      expect(moved.status).toBe(200);
      expect(employeeUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ planned_status: "removed", planned_from: "2026-11-13" }),
      );
      expect(employeeUpdate.mock.calls.at(-1)?.[0]).not.toHaveProperty("planned_note");
      expect(auditInsert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: "employee.last_day_changed",
          details: expect.objectContaining({ fromLastDay: "2026-11-08", lastDay: "2026-11-12" }),
        }),
      );

      arrange("active", null, null, leaving);
      const cancelled = await post({ action: "cancelPlannedChange" });
      expect(cancelled.status).toBe(200);
      expect(employeeUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ planned_status: null }),
      );
      expect(auditInsert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: "employee.last_day_cancelled",
          details: expect.objectContaining({ lastDay: "2026-11-08" }),
        }),
      );
    });

    it("replaces a planned away with a last day", async () => {
      arrange("active", null, null, {
        planned_status: "away",
        planned_from: "2026-11-02",
        planned_until: "2026-11-09",
        planned_absence_type_id: 134,
      });

      const response = await post({ action: "remove", lastDay: "2026-11-20" });

      expect(response.status).toBe(200);
      expect(employeeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          planned_status: "removed",
          planned_from: "2026-11-21",
          planned_until: null,
          planned_absence_type_id: null,
        }),
      );
    });

    it.each(["deactivate", "setReturnDate"])(
      "refuses an absence without a return date on %s",
      async (action) => {
        arrange(action === "deactivate" ? "active" : "inactive", "2026-11-02");

        const response = await post({ action, returnDate: null, absenceTypeId: 134 });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
          error: "Set a return date to fill their days with an absence.",
          code: "AWAY_ABSENCE_INVALID",
        });
        expect(employeeUpdate).not.toHaveBeenCalled();
      },
    );

    it("keeps the absence when only the return date moves", async () => {
      arrange("inactive", "2026-11-02", 134);

      await post({ action: "setReturnDate", returnDate: "2026-11-09" });

      expect(employeeUpdate.mock.calls[0][0]).not.toHaveProperty("away_absence_type_id");
    });

    it("changes the absence and records both sides", async () => {
      arrange("inactive", "2026-11-02", 134);

      const response = await post({
        action: "setReturnDate",
        returnDate: "2026-11-02",
        absenceTypeId: 135,
      });

      expect(response.status).toBe(200);
      expect(employeeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ away_absence_type_id: 135 }),
      );
      expect(auditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            fromAwayAbsenceTypeId: 134,
            toAwayAbsenceTypeId: 135,
          }),
        }),
      );
    });

    it("answers 400 when the database refuses an absence from elsewhere", async () => {
      arrange("active");
      employeeUpdateMaybeSingle.mockResolvedValueOnce({
        data: null,
        error: { code: "23514", message: "Absence type not found in this organization" },
      });

      const response = await post({
        action: "deactivate",
        returnDate: "2026-11-02",
        absenceTypeId: 999,
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Choose an absence your organization uses.",
        code: "AWAY_ABSENCE_INVALID",
      });
    });

    it("clears the return date on Mark active", async () => {
      arrange("inactive", "2026-11-02");

      const response = await post({ action: "activate" });

      expect(response.status).toBe(200);
      expect(employeeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active", away_until: null }),
      );
    });
  });

  it("restores an archived organization membership when reactivating a removed employee", async () => {
    const EMPLOYEE_USER_ID = "44444444-4444-4444-8444-444444444444";

    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "super_admin", admin_permissions: null },
      error: null,
    });
    profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });
    employeeCurrentSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "removed",
        version: 1,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    employeeUpdateMaybeSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "active",
        version: 2,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    membershipRestoreUpdate.mockResolvedValue({ error: null });
    auditInsert.mockResolvedValue({ error: null });

    const request = new NextRequest("http://localhost/api/employees/status", {
      method: "POST",
      body: JSON.stringify({
        empId: EMP_ID,
        orgId: ORG_ID,
        action: "activate",
        expectedVersion: 1,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    // Leaving credits the cleared shifts to updated_by, since the service
    // client has no auth.uid().
    expect(employeeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", updated_by: USER_ID }),
    );
    // The Remove-from-staff flow archives organization_memberships alongside
    // the employees.status flip — reactivating must undo both, or the user
    // passes employees.status but still can't log in.
    expect(membershipRestoreUpdate).toHaveBeenCalled();
    expect(cacheDel).toHaveBeenCalledWith(
      `dg:org:${ORG_ID}:orgUsers`,
      `dg:org:${ORG_ID}:orgDirectory`,
      `dg:org:${ORG_ID}:employees`,
      "dg:gm:allUsers",
    );
  });

  it("archives the organization membership when a super_admin removes a linked employee", async () => {
    const EMPLOYEE_USER_ID = "55555555-5555-4555-8555-555555555555";

    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "super_admin", admin_permissions: null },
      error: null,
    });
    profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });
    employeeCurrentSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "active",
        version: 1,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    employeeUpdateMaybeSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "removed",
        version: 2,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    // Target isn't a super_admin, so the last-super-admin guard passes through
    // without needing the count query.
    targetMembershipMaybeSingle.mockResolvedValue({ data: { org_role: "user" }, error: null });
    membershipArchiveUpdate.mockResolvedValue({ error: null });
    auditInsert.mockResolvedValue({ error: null });

    const request = new NextRequest("http://localhost/api/employees/status", {
      method: "POST",
      body: JSON.stringify({
        empId: EMP_ID,
        orgId: ORG_ID,
        action: "remove",
        expectedVersion: 1,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    // Access revocation happens in the same request as the status change —
    // not a second, separately-triggered client call — so a failed status
    // update can never leave access revoked for a still-active employee.
    expect(membershipArchiveUpdate).toHaveBeenCalled();
    expect(cacheDel).toHaveBeenCalledWith(
      `dg:org:${ORG_ID}:orgUsers`,
      `dg:org:${ORG_ID}:orgDirectory`,
      `dg:org:${ORG_ID}:employees`,
      "dg:gm:allUsers",
    );
  });

  it("uses the effective (sandbox-redirected) org id for the mutation, not the raw requested org id (H-1)", async () => {
    const EMPLOYEE_USER_ID = "88888888-8888-4888-8888-888888888888";

    // The caller's request body carries the REAL org id, but a sandbox
    // cookie is active — resolveEffectiveOrgId redirects to the sandbox.
    // Every downstream write/cache-key/audit-log call must use the
    // resolved (sandbox) org, never the raw requested one.
    resolveEffectiveOrgId.mockResolvedValue(SANDBOX_ORG_ID);
    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "super_admin", admin_permissions: null },
      error: null,
    });
    profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });
    employeeCurrentSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: SANDBOX_ORG_ID,
        status: "active",
        version: 1,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    employeeUpdateMaybeSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: SANDBOX_ORG_ID,
        status: "removed",
        version: 2,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    targetMembershipMaybeSingle.mockResolvedValue({ data: { org_role: "user" }, error: null });
    membershipArchiveUpdate.mockResolvedValue({ error: null });
    auditInsert.mockResolvedValue({ error: null });

    const request = new NextRequest("http://localhost/api/employees/status", {
      method: "POST",
      body: JSON.stringify({
        empId: EMP_ID,
        orgId: ORG_ID,
        action: "remove",
        expectedVersion: 1,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(resolveEffectiveOrgId).toHaveBeenCalledWith(expect.anything(), USER_ID, ORG_ID);
    // Cache keys and the audit log must be built from the effective (sandbox)
    // org, not the raw request body org — this is the guarantee that was
    // previously untested (the mock echoed its input, so divergence was
    // never actually exercised).
    expect(cacheDel).toHaveBeenCalledWith(
      `dg:org:${SANDBOX_ORG_ID}:orgUsers`,
      `dg:org:${SANDBOX_ORG_ID}:orgDirectory`,
      `dg:org:${SANDBOX_ORG_ID}:employees`,
      "dg:gm:allUsers",
    );
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ org_id: SANDBOX_ORG_ID }));
  });

  it("refuses to remove the org's only super_admin", async () => {
    const EMPLOYEE_USER_ID = "77777777-7777-4777-8777-777777777777";

    // The actor is a gridmaster here specifically because a super_admin actor
    // removing another super_admin can never hit count <= 1 (removing them
    // still leaves the actor); a gridmaster has no org_role of their own, so
    // this is the scenario that actually reaches the count == 1 case.
    membershipMaybeSingle.mockResolvedValue({ data: null, error: null });
    profileSingle.mockResolvedValue({ data: { platform_role: "gridmaster" }, error: null });
    employeeCurrentSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "active",
        version: 1,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    targetMembershipMaybeSingle.mockResolvedValue({
      data: { org_role: "super_admin" },
      error: null,
    });
    superAdminCountIs.mockResolvedValue({ count: 1, error: null });

    const request = new NextRequest("http://localhost/api/employees/status", {
      method: "POST",
      body: JSON.stringify({
        empId: EMP_ID,
        orgId: ORG_ID,
        action: "remove",
        expectedVersion: 1,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    // Removing staff already fully blocks login at the JWT hook regardless of
    // org_role, so this must be refused before the employees row is ever
    // touched — the same protection DELETE /api/organizations/access applies.
    expect(employeeUpdateMaybeSingle).not.toHaveBeenCalled();
  });

  it("does not touch organization membership when a non-super-admin reactivates a linked employee", async () => {
    const EMPLOYEE_USER_ID = "66666666-6666-4666-8666-666666666666";

    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "admin", admin_permissions: { canManageEmployees: true } },
      error: null,
    });
    profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });
    employeeCurrentSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "removed",
        version: 1,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    employeeUpdateMaybeSingle.mockResolvedValue({
      data: {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "active",
        version: 2,
        user_id: EMPLOYEE_USER_ID,
      },
      error: null,
    });
    auditInsert.mockResolvedValue({ error: null });

    const request = new NextRequest("http://localhost/api/employees/status", {
      method: "POST",
      body: JSON.stringify({
        empId: EMP_ID,
        orgId: ORG_ID,
        action: "activate",
        expectedVersion: 1,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    // Only gridmaster/super_admin may change org membership access — the same
    // tier required by DELETE /api/organizations/access — so a plain admin
    // with canManageEmployees can't use Activate as a side door to restore it.
    expect(membershipRestoreUpdate).not.toHaveBeenCalled();
    expect(membershipArchiveUpdate).not.toHaveBeenCalled();
  });

  describe("suspension", () => {
    const LINKED_USER_ID = "88888888-8888-4888-8888-888888888888";

    function arrange(
      row: Record<string, unknown>,
      actor: "super_admin" | "gridmaster" = "super_admin",
    ) {
      membershipMaybeSingle.mockResolvedValue({
        data: actor === "super_admin" ? { org_role: "super_admin", admin_permissions: null } : null,
        error: null,
      });
      profileSingle.mockResolvedValue({
        data: { platform_role: actor === "gridmaster" ? "gridmaster" : "none" },
        error: null,
      });
      const current = {
        id: EMP_ID,
        org_id: ORG_ID,
        status: "active",
        version: 1,
        user_id: LINKED_USER_ID,
        focus_area_ids: [7],
        ...row,
      };
      employeeCurrentSingle.mockResolvedValue({ data: current, error: null });
      employeeUpdateMaybeSingle.mockImplementation(async () => ({
        data: { ...current, ...(employeeUpdate.mock.calls.at(-1)?.[0] as Record<string, unknown>) },
        error: null,
      }));
      targetMembershipMaybeSingle.mockResolvedValue({ data: { org_role: "user" }, error: null });
      auditInsert.mockResolvedValue({ error: null });
      endUserSessions.mockResolvedValue(undefined);
      disableMobilePushTokensForOrg.mockResolvedValue(undefined);
    }

    function post(action: string) {
      return POST(
        new NextRequest("http://localhost/api/employees/status", {
          method: "POST",
          body: JSON.stringify({ empId: EMP_ID, orgId: ORG_ID, action, expectedVersion: 1 }),
        }),
      );
    }

    it("suspends someone, signs them out everywhere and stops their push", async () => {
      arrange({});

      const response = await post("suspend");

      expect(response.status).toBe(200);
      const update = employeeUpdate.mock.calls[0][0] as Record<string, unknown>;
      expect(update).toMatchObject({ suspended_by: USER_ID, updated_by: USER_ID });
      expect(update.suspended_at).toEqual(expect.any(String));
      expect(update).not.toHaveProperty("status");
      expect(endUserSessions).toHaveBeenCalledWith(LINKED_USER_ID);
      expect(disableMobilePushTokensForOrg).toHaveBeenCalledWith(expect.anything(), {
        userId: LINKED_USER_ID,
        orgId: ORG_ID,
      });
      expect(auditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "employee.suspended",
          details: { changedFields: ["suspended_at"] },
        }),
      );
      expect((await response.json()).employee.suspendedAt).toEqual(expect.any(String));
      expect(scheduleSuspensionNotice).toHaveBeenCalledWith({
        orgId: ORG_ID,
        empId: EMP_ID,
        actorId: USER_ID,
      });
    });

    it("still suspends when signing out fails, which the hook backs up", async () => {
      arrange({});
      endUserSessions.mockRejectedValueOnce(new Error("redis down"));

      expect((await post("suspend")).status).toBe(200);
    });

    it.each([
      ["someone away", { status: "inactive" }],
      ["someone archived", { status: "removed", archived_at: "2026-10-01T00:00:00Z" }],
      ["someone already suspended", { suspended_at: "2026-10-26T00:00:00Z" }],
    ])("refuses to suspend %s", async (_label, row) => {
      arrange(row);

      const response = await post("suspend");

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Only someone who is active can be suspended.",
        code: "NOT_SUSPENDABLE",
      });
      expect(employeeUpdate).not.toHaveBeenCalled();
      expect(endUserSessions).not.toHaveBeenCalled();
    });

    it("refuses to suspend someone with no account", async () => {
      arrange({ user_id: null });

      const response = await post("suspend");

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Only someone with an account can be suspended.",
        code: "NO_ACCOUNT",
      });
      expect(employeeUpdate).not.toHaveBeenCalled();
    });

    it("refuses to suspend the only super admin", async () => {
      arrange({}, "gridmaster");
      targetMembershipMaybeSingle.mockResolvedValue({
        data: { org_role: "super_admin" },
        error: null,
      });
      superAdminCountIs.mockResolvedValue({ count: 1, error: null });

      const response = await post("suspend");

      expect(response.status).toBe(400);
      expect(employeeUpdate).not.toHaveBeenCalled();
    });

    it("asks a Gridmaster for fresh proof before suspending", async () => {
      arrange({}, "gridmaster");
      requireSensitiveActionAuth.mockResolvedValue({
        response: new Response(null, { status: 403 }),
      });

      const response = await post("suspend");

      expect(response.status).toBe(403);
      expect(employeeUpdate).not.toHaveBeenCalled();
    });

    it("reinstates a suspended person without touching their sessions", async () => {
      arrange({ suspended_at: "2026-10-26T00:00:00Z" });

      const response = await post("reinstate");

      expect(response.status).toBe(200);
      expect(employeeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ suspended_at: null, suspended_by: null }),
      );
      expect(endUserSessions).not.toHaveBeenCalled();
      expect(auditInsert).toHaveBeenCalledWith(
        expect.objectContaining({ action: "employee.reinstated" }),
      );
      expect(scheduleSuspensionNotice).not.toHaveBeenCalled();
    });

    describe("with a start and an end (51g3)", () => {
      // 01:00 UTC on Oct 27 is still Oct 26 in Los Angeles.
      function arrangeDated(row: Record<string, unknown>) {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-10-27T01:00:00.000Z"));
        orgTimezoneSingle.mockResolvedValue({
          data: { timezone: "America/Los_Angeles" },
          error: null,
        });
        arrange(row);
      }

      function postWith(body: Record<string, unknown>) {
        return POST(
          new NextRequest("http://localhost/api/employees/status", {
            method: "POST",
            body: JSON.stringify({ empId: EMP_ID, orgId: ORG_ID, expectedVersion: 1, ...body }),
          }),
        );
      }

      afterEach(() => {
        vi.useRealTimers();
      });

      it("suspends now until an end date", async () => {
        arrangeDated({});

        const response = await postWith({ action: "suspend", returnDate: "2026-11-20" });

        expect(response.status).toBe(200);
        expect(employeeUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ suspended_until: "2026-11-20", suspended_by: USER_ID }),
        );
        expect(endUserSessions).toHaveBeenCalledWith(LINKED_USER_ID);
        expect(auditInsert).toHaveBeenCalledWith(
          expect.objectContaining({
            action: "employee.suspended",
            details: { suspendedUntil: "2026-11-20", changedFields: ["suspended_at"] },
          }),
        );
      });

      it("refuses an end date on or before today", async () => {
        arrangeDated({});

        const response = await postWith({ action: "suspend", returnDate: "2026-10-26" });

        expect(response.status).toBe(400);
        expect((await response.json()).code).toBe("SUSPENDED_UNTIL_INVALID");
        expect(employeeUpdate).not.toHaveBeenCalled();
      });

      it("plans a suspension for a later start without signing them out", async () => {
        arrangeDated({});

        const response = await postWith({
          action: "suspend",
          startDate: "2026-11-10",
          returnDate: "2026-11-20",
        });

        expect(response.status).toBe(200);
        const update = employeeUpdate.mock.calls[0][0] as Record<string, unknown>;
        expect(update).toMatchObject({
          planned_status: "suspended",
          planned_from: "2026-11-10",
          planned_until: "2026-11-20",
          planned_absence_type_id: null,
          planned_by: USER_ID,
        });
        expect(update).not.toHaveProperty("suspended_at");
        expect(update).not.toHaveProperty("status_changed_at");
        expect(endUserSessions).not.toHaveBeenCalled();
        expect(scheduleSuspensionNotice).not.toHaveBeenCalled();
        expect(auditInsert).toHaveBeenCalledWith(
          expect.objectContaining({
            action: "employee.suspension_planned",
            details: {
              plannedFrom: "2026-11-10",
              plannedUntil: "2026-11-20",
              changedFields: ["planned_status"],
            },
          }),
        );
      });

      it("refuses a planned suspension with no account, or an end before its start", async () => {
        arrangeDated({ user_id: null });
        expect(
          (await (await postWith({ action: "suspend", startDate: "2026-11-10" })).json()).code,
        ).toBe("NO_ACCOUNT");

        arrangeDated({});
        const early = await postWith({
          action: "suspend",
          startDate: "2026-11-10",
          returnDate: "2026-11-09",
        });
        expect(await early.json()).toEqual({
          error: "Choose an end date after the start date.",
          code: "SUSPENDED_UNTIL_INVALID",
        });
        expect(employeeUpdate).not.toHaveBeenCalled();
      });

      it("moves and cancels a planned suspension", async () => {
        const planned = { planned_status: "suspended", planned_from: "2026-11-10" };
        arrangeDated({ ...planned, focus_area_ids: [] });

        const moved = await postWith({
          action: "setPlannedChange",
          startDate: "2026-11-12",
          returnDate: null,
        });
        expect(moved.status).toBe(200);
        expect(employeeUpdate).toHaveBeenLastCalledWith(
          expect.objectContaining({
            planned_status: "suspended",
            planned_from: "2026-11-12",
            planned_until: null,
          }),
        );
        expect(auditInsert).toHaveBeenLastCalledWith(
          expect.objectContaining({ action: "employee.suspension_plan_changed" }),
        );

        arrangeDated(planned);
        expect((await postWith({ action: "cancelPlannedChange" })).status).toBe(200);
        expect(auditInsert).toHaveBeenLastCalledWith(
          expect.objectContaining({ action: "employee.suspension_plan_cancelled" }),
        );
      });

      it("sets a suspended person's end date, and refuses someone not suspended", async () => {
        arrangeDated({ suspended_at: "2026-10-20T00:00:00Z" });

        const response = await postWith({ action: "setSuspendedUntil", returnDate: "2026-11-20" });

        expect(response.status).toBe(200);
        const update = employeeUpdate.mock.calls[0][0] as Record<string, unknown>;
        expect(update).toMatchObject({ suspended_until: "2026-11-20" });
        expect(update).not.toHaveProperty("status_changed_at");
        expect(endUserSessions).not.toHaveBeenCalled();
        expect(auditInsert).toHaveBeenCalledWith(
          expect.objectContaining({
            action: "employee.suspension_end_changed",
            details: {
              fromSuspendedUntil: null,
              toSuspendedUntil: "2026-11-20",
              changedFields: ["suspended_until"],
            },
          }),
        );

        arrangeDated({});
        const notSuspended = await postWith({ action: "setSuspendedUntil", returnDate: null });
        expect((await notSuspended.json()).code).toBe("NOT_SUSPENDED");
      });
    });

    it("refuses to reinstate someone who isn't suspended", async () => {
      arrange({});

      const response = await post("reinstate");

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "They aren't suspended.",
        code: "NOT_SUSPENDED",
      });
    });
  });
});
