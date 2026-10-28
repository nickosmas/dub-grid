import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const selectLte = vi.fn();
const updateEmployee = vi.fn();
const updateMaybeSingle = vi.fn();
const auditInsert = vi.fn();
const cacheDel = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "audit_log") return { insert: auditInsert };
      if (table !== "employees") throw new Error(`Unexpected table: ${table}`);
      return {
        // Both reads end in lte(column, bound); the column tells them apart.
        select: vi.fn(() => {
          const query = {
            eq: () => query,
            is: () => query,
            not: () => query,
            lte: (...args: unknown[]) => selectLte(...args),
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
  default: { error: vi.fn() },
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

/** The planned-away read gets `plans`, the return read `aways`. */
function rows(plans: unknown[], aways: unknown[] = []) {
  selectLte.mockImplementation(async (column: string) => ({
    data: column === "planned_from" ? plans : aways,
    error: null,
  }));
}

function away(id: string, orgId: string, awayUntil: string, timezone: string) {
  return { id, org_id: orgId, away_until: awayUntil, version: 3, organization: { timezone } };
}

describe("GET /api/cron/return-from-away", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(await res.json()).toEqual({ ok: true, started: 0, returned: 1, skipped: 0 });
    // A day past UTC's today bounds every timezone.
    expect(selectLte).toHaveBeenCalledWith("away_until", "2026-10-28");
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

    expect(await res.json()).toEqual({ ok: true, started: 0, returned: 1, skipped: 0 });
    expect(updateEmployee).toHaveBeenCalledTimes(1);
    expect(updateEmployee.mock.calls[0][1]).toContainEqual(["id", "emp-tokyo"]);
  });

  it("does nothing when nobody is due", async () => {
    const res = await GET(makeReq());

    expect(await res.json()).toEqual({ ok: true, started: 0, returned: 0 });
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

    expect(await res.json()).toEqual({ ok: true, started: 0, returned: 0, skipped: 1 });
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("marks someone Away when their planned Away starts today, with its return date", async () => {
    rows([planned("emp-la", "org-la", "2026-10-26", "2027-01-04", "America/Los_Angeles")]);

    const res = await GET(makeReq());

    expect(await res.json()).toEqual({ ok: true, started: 1, returned: 0 });
    expect(selectLte).toHaveBeenCalledWith("planned_from", "2026-10-28");
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

  it("still returns people when starting plans fails", async () => {
    selectLte.mockImplementation(async (column: string) =>
      column === "planned_from"
        ? { data: null, error: new Error("read failed") }
        : { data: [away("emp-la", "org-la", "2026-10-26", "America/Los_Angeles")], error: null },
    );

    const res = await GET(makeReq());

    expect(await res.json()).toEqual({ ok: true, started: 0, returned: 1, skipped: 0 });
  });
});
