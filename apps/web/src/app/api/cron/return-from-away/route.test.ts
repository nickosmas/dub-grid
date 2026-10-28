import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const selectLte = vi.fn();
const updateEmployee = vi.fn();
const updateMaybeSingle = vi.fn();
const auditInsert = vi.fn();
const cacheDel = vi.fn();
const endOffboardedAccess = vi.fn();
const endUserSessions = vi.fn();
const disablePush = vi.fn();
const scheduleSuspensionNotice = vi.fn();
/** org_role by "<userId>:<orgId>", and platform_role by user id. */
const orgRoles = new Map<string, string>();
const platformRoles = new Map<string, string>();
const superAdminCount = vi.fn(() => 2);

vi.mock("@/features/employees/server/offboard-access", () => ({
  endOffboardedAccess: (...args: unknown[]) => endOffboardedAccess(...args),
}));

vi.mock("@/features/employees/server/suspension-notice", () => ({
  scheduleSuspensionNotice: (...args: unknown[]) => scheduleSuspensionNotice(...args),
}));

vi.mock("@/lib/auth/revocation", () => ({
  endUserSessions: (...args: unknown[]) => endUserSessions(...args),
}));

vi.mock("@dubgrid/data-access", () => ({
  disableMobilePushTokensForOrg: (...args: unknown[]) => disablePush(...args),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "audit_log") return { insert: auditInsert };
      if (table === "profiles") {
        return {
          select: () => ({
            eq: (_column: string, id: string) => ({
              maybeSingle: async () => ({
                data: platformRoles.has(id) ? { platform_role: platformRoles.get(id) } : null,
              }),
            }),
          }),
        };
      }
      if (table === "organization_memberships") {
        return {
          select: (_columns: string, options?: { count?: string }) => {
            const eqs: Record<string, unknown> = {};
            const query = {
              eq: (column: string, value: unknown) => {
                eqs[column] = value;
                return query;
              },
              is: () => (options?.count ? Promise.resolve({ count: superAdminCount() }) : query),
              maybeSingle: async () => {
                const role = orgRoles.get(`${eqs.user_id}:${eqs.org_id}`);
                return { data: role ? { org_role: role } : null };
              },
            };
            return query;
          },
        };
      }
      if (table !== "employees") throw new Error(`Unexpected table: ${table}`);
      return {
        // Every read ends in lte(column, bound); the column and the planned
        // status filter tell them apart.
        select: vi.fn(() => {
          const eqs: Record<string, unknown> = {};
          const query = {
            eq: (column: string, value: unknown) => {
              eqs[column] = value;
              return query;
            },
            is: () => query,
            not: () => query,
            lte: (column: string, bound: string) => selectLte(column, bound, eqs.planned_status),
          };
          return query;
        }),
        update: (values: Record<string, unknown>) => {
          const filters: unknown[][] = [];
          const chain = {
            eq: (...args: unknown[]) => {
              filters.push(args);
              return chain;
            },
            select: () => ({
              maybeSingle: () => {
                updateEmployee(values, filters);
                return updateMaybeSingle();
              },
            }),
          };
          return chain;
        },
      };
    },
  }),
}));

vi.mock("@/lib/db/shared", () => ({
  cacheDel: (...keys: string[]) => cacheDel(...keys),
  CacheKey: { employees: (orgId: string) => `dg:org:${orgId}:employees` },
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn() },
}));

const isFeatureEnabled = vi.fn(async (_key: string) => true);
vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: (key: string) => isFeatureEnabled(key),
}));

import { GET } from "./route";

const SECRET = "test-cron-secret";

function makeReq(headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) {
  return new NextRequest("http://localhost/api/cron/return-from-away", { headers });
}

function planned(id: string, orgId: string, from: string, until: string | null, timezone: string) {
  return {
    id,
    org_id: orgId,
    planned_from: from,
    planned_until: until,
    planned_absence_type_id: until ? 134 : null,
    planned_note: "Leave",
    version: 3,
    organization: { timezone },
  };
}

/**
 * The planned-away read gets `plans`, the last-day read `lastDays`, the
 * return read `aways`, the ended-suspension read `ending` and the
 * planned-suspension read `suspensions`.
 */
function rows(
  plans: unknown[],
  aways: unknown[] = [],
  lastDays: unknown[] = [],
  { ending = [], suspensions = [] }: { ending?: unknown[]; suspensions?: unknown[] } = {},
) {
  selectLte.mockImplementation(async (column: string, _bound: string, plannedStatus: unknown) => ({
    data:
      column === "suspended_until"
        ? ending
        : column !== "planned_from"
          ? aways
          : plannedStatus === "removed"
            ? lastDays
            : plannedStatus === "suspended"
              ? suspensions
              : plans,
    error: null,
  }));
}

/** Last day the day before `from`, set by `plannedBy`. */
function leaving(
  id: string,
  orgId: string,
  from: string,
  timezone: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    org_id: orgId,
    user_id: `user-${id}`,
    planned_from: from,
    planned_note: "Moving",
    planned_by: "manager-1",
    version: 5,
    organization: { timezone },
    ...extra,
  };
}

function away(id: string, orgId: string, awayUntil: string, timezone: string) {
  return { id, org_id: orgId, away_until: awayUntil, version: 3, organization: { timezone } };
}

describe("GET /api/cron/return-from-away", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgRoles.clear();
    platformRoles.clear();
    superAdminCount.mockReturnValue(2);
    vi.useFakeTimers({ toFake: ["Date"] });
    // Oct 27 in UTC and Tokyo, still Oct 26 in Los Angeles.
    vi.setSystemTime(new Date("2026-10-27T01:00:00.000Z"));
    process.env.CRON_SECRET = SECRET;
    isFeatureEnabled.mockResolvedValue(true);
    selectLte.mockResolvedValue({ data: [], error: null });
    updateMaybeSingle.mockResolvedValue({ data: { id: "updated" }, error: null });
    auditInsert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a request without the bearer token", async () => {
    const res = await GET(makeReq({}));

    expect(res.status).toBe(401);
    expect(selectLte).not.toHaveBeenCalled();
  });

  it("refuses to run without CRON_SECRET", async () => {
    delete process.env.CRON_SECRET;

    const res = await GET(makeReq());

    expect(res.status).toBe(503);
    expect(selectLte).not.toHaveBeenCalled();
  });

  it("skips with a 200 when the flag is off", async () => {
    isFeatureEnabled.mockResolvedValue(false);

    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: true, reason: "disabled" });
    expect(isFeatureEnabled).toHaveBeenCalledWith("cron_return_from_away");
    expect(selectLte).not.toHaveBeenCalled();
  });

  it("sets someone due today back to Active and logs it", async () => {
    selectLte.mockResolvedValue({
      data: [away("emp-la", "org-la", "2026-10-26", "America/Los_Angeles")],
      error: null,
    });

    const res = await GET(makeReq());

    expect(await res.json()).toEqual({
      ok: true,
      started: 0,
      offboarded: 0,
      reinstated: 0,
      suspended: 0,
      returned: 1,
      skipped: 0,
    });
    // A day past UTC's today bounds every timezone.
    expect(selectLte).toHaveBeenCalledWith("away_until", "2026-10-28", undefined);
    expect(updateEmployee).toHaveBeenCalledWith(
      {
        status: "active",
        status_note: "",
        away_until: null,
        status_changed_at: "2026-10-27T01:00:00.000Z",
        version: 4,
      },
      [
        ["id", "emp-la"],
        ["org_id", "org-la"],
        ["version", 3],
      ],
    );
    expect(auditInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        org_id: "org-la",
        actor_id: null,
        action: "employee.activated",
        resource_id: "emp-la",
        details: expect.objectContaining({ awayUntil: "2026-10-26" }),
      }),
    ]);
    expect(cacheDel).toHaveBeenCalledWith("dg:org:org-la:employees");
  });

  it("returns someone due tomorrow only where tomorrow has already begun", async () => {
    selectLte.mockResolvedValue({
      data: [
        away("emp-tokyo", "org-tokyo", "2026-10-27", "Asia/Tokyo"),
        away("emp-la", "org-la", "2026-10-27", "America/Los_Angeles"),
      ],
      error: null,
    });

    const res = await GET(makeReq());

    expect(await res.json()).toEqual({
      ok: true,
      started: 0,
      offboarded: 0,
      reinstated: 0,
      suspended: 0,
      returned: 1,
      skipped: 0,
    });
    expect(updateEmployee).toHaveBeenCalledTimes(1);
    expect(updateEmployee.mock.calls[0][1]).toContainEqual(["id", "emp-tokyo"]);
  });

  it("does nothing when nobody is due", async () => {
    const res = await GET(makeReq());

    expect(await res.json()).toEqual({
      ok: true,
      started: 0,
      offboarded: 0,
      reinstated: 0,
      suspended: 0,
      returned: 0,
    });
    expect(updateEmployee).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("leaves someone a manager changed meanwhile alone", async () => {
    selectLte.mockResolvedValue({
      data: [away("emp-la", "org-la", "2026-10-26", "America/Los_Angeles")],
      error: null,
    });
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await GET(makeReq());

    expect(await res.json()).toEqual({
      ok: true,
      started: 0,
      offboarded: 0,
      reinstated: 0,
      suspended: 0,
      returned: 0,
      skipped: 1,
    });
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("marks someone Away when their planned Away starts today, with its return date", async () => {
    rows([planned("emp-la", "org-la", "2026-10-26", "2027-01-04", "America/Los_Angeles")]);

    const res = await GET(makeReq());

    expect(await res.json()).toEqual({
      ok: true,
      started: 1,
      offboarded: 0,
      reinstated: 0,
      suspended: 0,
      returned: 0,
    });
    expect(selectLte).toHaveBeenCalledWith("planned_from", "2026-10-28", "away");
    expect(updateEmployee).toHaveBeenCalledWith(
      {
        status: "inactive",
        status_note: "Leave",
        status_changed_at: "2026-10-27T01:00:00.000Z",
        away_until: "2027-01-04",
        away_absence_type_id: 134,
        planned_status: null,
        version: 4,
      },
      [
        ["id", "emp-la"],
        ["org_id", "org-la"],
        ["version", 3],
      ],
    );
    expect(auditInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        action: "employee.deactivated",
        resource_id: "emp-la",
        details: expect.objectContaining({ plannedFrom: "2026-10-26", awayUntil: "2027-01-04" }),
      }),
    ]);
  });

  it("starts a plan dated tomorrow only where tomorrow has already begun", async () => {
    rows([
      planned("emp-tokyo", "org-tokyo", "2026-10-27", null, "Asia/Tokyo"),
      planned("emp-la", "org-la", "2026-10-27", null, "America/Los_Angeles"),
    ]);

    const res = await GET(makeReq());

    expect((await res.json()).started).toBe(1);
    expect(updateEmployee).toHaveBeenCalledTimes(1);
    expect(updateEmployee.mock.calls[0][1]).toContainEqual(["id", "emp-tokyo"]);
  });

  it("drops a plan whose return date has already come, without marking them away", async () => {
    rows([planned("emp-la", "org-la", "2026-10-20", "2026-10-26", "America/Los_Angeles")]);

    const res = await GET(makeReq());

    expect((await res.json()).started).toBe(0);
    expect(updateEmployee).toHaveBeenCalledWith(
      { planned_status: null, version: 4 },
      expect.anything(),
    );
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("offboards someone the day after their last day, as a manual Offboard does (51g2)", async () => {
    orgRoles.set("manager-1:org-la", "super_admin");
    rows([], [], [leaving("emp-la", "org-la", "2026-10-26", "America/Los_Angeles")]);

    const res = await GET(makeReq());

    expect((await res.json()).offboarded).toBe(1);
    expect(updateEmployee).toHaveBeenCalledWith(
      {
        status: "removed",
        status_note: "Moving",
        archived_at: "2026-10-27T01:00:00.000Z",
        status_changed_at: "2026-10-27T01:00:00.000Z",
        updated_by: "manager-1",
        version: 6,
      },
      [
        ["id", "emp-la"],
        ["org_id", "org-la"],
        ["version", 5],
      ],
    );
    expect(endOffboardedAccess).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-la",
      empId: "emp-la",
      userId: "user-emp-la",
      actorId: "manager-1",
      at: "2026-10-27T01:00:00.000Z",
    });
    expect(auditInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        action: "employee.removed",
        actor_id: null,
        resource_id: "emp-la",
        details: expect.objectContaining({ toStatus: "removed", lastDay: "2026-10-25" }),
      }),
    ]);
  });

  it("ends the membership whoever planned the last day (51k)", async () => {
    orgRoles.set("manager-1:org-la", "admin");
    platformRoles.set("gm-1", "gridmaster");
    rows(
      [],
      [],
      [
        leaving("emp-1", "org-la", "2026-10-26", "America/Los_Angeles"),
        leaving("emp-2", "org-la", "2026-10-26", "America/Los_Angeles", { planned_by: "gm-1" }),
      ],
    );

    await GET(makeReq());

    expect(endOffboardedAccess.mock.calls.map((call) => call[1].empId)).toEqual(["emp-1", "emp-2"]);
    expect(endOffboardedAccess.mock.calls.every((call) => !("endMembership" in call[1]))).toBe(
      true,
    );
  });

  it("waits while their last day is still today in the organization's timezone", async () => {
    rows([], [], [leaving("emp-la", "org-la", "2026-10-27", "America/Los_Angeles")]);

    const res = await GET(makeReq());

    expect((await res.json()).offboarded).toBe(0);
    expect(updateEmployee).not.toHaveBeenCalled();
  });

  it("leaves the organization's only Super Admin as they are", async () => {
    orgRoles.set("user-emp-la:org-la", "super_admin");
    superAdminCount.mockReturnValue(1);
    rows([], [], [leaving("emp-la", "org-la", "2026-10-26", "America/Los_Angeles")]);

    const res = await GET(makeReq());

    expect((await res.json()).offboarded).toBe(0);
    expect(updateEmployee).not.toHaveBeenCalled();
    expect(endOffboardedAccess).not.toHaveBeenCalled();
  });

  it("skips the follow-up for someone a manager changed meanwhile", async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    rows([], [], [leaving("emp-la", "org-la", "2026-10-26", "America/Los_Angeles")]);

    const res = await GET(makeReq());

    expect((await res.json()).offboarded).toBe(0);
    expect(endOffboardedAccess).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  describe("suspensions with a start and an end (51g3)", () => {
    function ending(id: string, orgId: string, until: string, timezone: string) {
      return { id, org_id: orgId, suspended_until: until, version: 7, organization: { timezone } };
    }

    function plannedSuspension(
      id: string,
      orgId: string,
      from: string,
      until: string | null,
      timezone: string,
      extra: Record<string, unknown> = {},
    ) {
      return {
        id,
        org_id: orgId,
        user_id: `user-${id}`,
        planned_from: from,
        planned_until: until,
        planned_by: "manager-1",
        version: 4,
        organization: { timezone },
        ...extra,
      };
    }

    it("reinstates someone whose suspension ends today, as a manual Reinstate does", async () => {
      rows([], [], [], {
        ending: [
          ending("emp-la", "org-la", "2026-10-26", "America/Los_Angeles"),
          ending("emp-later", "org-la", "2026-10-27", "America/Los_Angeles"),
        ],
      });

      const res = await GET(makeReq());

      expect((await res.json()).reinstated).toBe(1);
      expect(selectLte).toHaveBeenCalledWith("suspended_until", "2026-10-28", undefined);
      expect(updateEmployee).toHaveBeenCalledTimes(1);
      expect(updateEmployee).toHaveBeenCalledWith(
        {
          suspended_at: null,
          suspended_by: null,
          status_changed_at: "2026-10-27T01:00:00.000Z",
          version: 8,
        },
        [
          ["id", "emp-la"],
          ["org_id", "org-la"],
          ["version", 7],
        ],
      );
      expect(auditInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          action: "employee.reinstated",
          actor_id: null,
          resource_id: "emp-la",
          details: { suspendedUntil: "2026-10-26", changedFields: ["suspended_at"] },
        }),
      ]);
    });

    it("suspends someone whose planned suspension starts today, with its end, and follows up", async () => {
      rows([], [], [], {
        suspensions: [
          plannedSuspension("emp-la", "org-la", "2026-10-26", "2026-11-20", "America/Los_Angeles"),
          plannedSuspension("emp-later", "org-la", "2026-10-27", null, "America/Los_Angeles"),
        ],
      });

      const res = await GET(makeReq());

      expect((await res.json()).suspended).toBe(1);
      expect(updateEmployee).toHaveBeenCalledTimes(1);
      expect(updateEmployee).toHaveBeenCalledWith(
        {
          suspended_at: "2026-10-27T01:00:00.000Z",
          suspended_by: "manager-1",
          suspended_until: "2026-11-20",
          status_changed_at: "2026-10-27T01:00:00.000Z",
          updated_by: "manager-1",
          version: 5,
        },
        [
          ["id", "emp-la"],
          ["org_id", "org-la"],
          ["version", 4],
        ],
      );
      expect(endUserSessions).toHaveBeenCalledWith("user-emp-la");
      expect(disablePush).toHaveBeenCalledWith(expect.anything(), {
        userId: "user-emp-la",
        orgId: "org-la",
      });
      expect(scheduleSuspensionNotice).toHaveBeenCalledWith({
        orgId: "org-la",
        empId: "emp-la",
        actorId: "manager-1",
      });
      expect(auditInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          action: "employee.suspended",
          actor_id: null,
          details: {
            plannedFrom: "2026-10-26",
            suspendedUntil: "2026-11-20",
            changedFields: ["suspended_at"],
          },
        }),
      ]);
    });

    it("drops a plan whose end has come or whose person has no account", async () => {
      rows([], [], [], {
        suspensions: [
          plannedSuspension("emp-1", "org-la", "2026-10-20", "2026-10-26", "America/Los_Angeles"),
          plannedSuspension("emp-2", "org-la", "2026-10-26", null, "America/Los_Angeles", {
            user_id: null,
          }),
        ],
      });

      const res = await GET(makeReq());

      expect((await res.json()).suspended).toBe(0);
      expect(updateEmployee.mock.calls.map((call) => call[0])).toEqual([
        { planned_status: null, version: 5 },
        { planned_status: null, version: 5 },
      ]);
      expect(endUserSessions).not.toHaveBeenCalled();
      expect(scheduleSuspensionNotice).not.toHaveBeenCalled();
    });

    it("leaves the organization's only Super Admin with their plan", async () => {
      orgRoles.set("user-emp-la:org-la", "super_admin");
      superAdminCount.mockReturnValue(1);
      rows([], [], [], {
        suspensions: [
          plannedSuspension("emp-la", "org-la", "2026-10-26", null, "America/Los_Angeles"),
        ],
      });

      const res = await GET(makeReq());

      expect((await res.json()).suspended).toBe(0);
      expect(updateEmployee).not.toHaveBeenCalled();
    });

    it("still suspends when signing out fails, which the hook backs up", async () => {
      endUserSessions.mockRejectedValueOnce(new Error("redis down"));
      rows([], [], [], {
        suspensions: [
          plannedSuspension("emp-la", "org-la", "2026-10-26", null, "America/Los_Angeles"),
        ],
      });

      const res = await GET(makeReq());

      expect((await res.json()).suspended).toBe(1);
      expect(scheduleSuspensionNotice).toHaveBeenCalled();
    });
  });

  it("still returns people when starting plans fails", async () => {
    selectLte.mockImplementation(async (column: string) =>
      column === "planned_from"
        ? { data: null, error: new Error("read failed") }
        : { data: [away("emp-la", "org-la", "2026-10-26", "America/Los_Angeles")], error: null },
    );

    const res = await GET(makeReq());

    expect(await res.json()).toEqual({
      ok: true,
      started: 0,
      offboarded: 0,
      reinstated: 0,
      suspended: 0,
      returned: 1,
      skipped: 0,
    });
  });
});
