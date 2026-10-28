import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_ERRORS } from "@dubgrid/client-errors";

type Row = Record<string, unknown>;

const tables: Record<string, Row[]> = {};
const requireAuthenticatedUser = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const validateCsrfOrigin = vi.fn();
const checkRateLimit = vi.fn();
const canManageEmployees = vi.fn();
const endUserSessions = vi.fn();
const endOffboardedAccess = vi.fn();
const scheduleSuspensionNotice = vi.fn();
const captureException = vi.fn();
let failUpdateFor: string | null = null;

/** Just enough of the Supabase query builder for the status change's queries. */
function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let patch: Row | null = null;
  let countOnly = false;
  const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
  const run = () => {
    if (patch) {
      const hit = rows();
      if (failUpdateFor && hit.some((row) => row.id === failUpdateFor)) {
        return { data: null, error: new Error("database down") };
      }
      hit.forEach((row) => Object.assign(row, patch));
      return { data: hit, error: null };
    }
    const data = rows();
    return { data, error: null, count: countOnly ? data.length : null };
  };
  const builder = {
    select: (_cols?: string, opts?: { count?: string }) => {
      countOnly = Boolean(opts?.count);
      return builder;
    },
    update: (values: Row) => {
      patch = values;
      return builder;
    },
    insert: (row: Row) => {
      (tables[table] ??= []).push(row);
      return Promise.resolve({ error: null });
    },
    eq: (col: string, value: unknown) => {
      filters.push((row) => row[col] === value);
      return builder;
    },
    is: (col: string, value: unknown) => {
      filters.push((row) => (row[col] ?? null) === value);
      return builder;
    },
    not: (col: string, _op: "is", value: unknown) => {
      filters.push((row) => (row[col] ?? null) !== value);
      return builder;
    },
    in: (col: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[col]));
      return builder;
    },
    or: (expr: string) => {
      expect(expr).toBe("status.eq.removed,suspended_at.not.is.null");
      filters.push((row) => row.status === "removed" || row.suspended_at != null);
      return builder;
    },
    single: () => {
      const { data, error } = run();
      const list = data as Row[] | null;
      return Promise.resolve({ data: list?.[0] ?? null, error: error ?? null });
    },
    maybeSingle: () => builder.single(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return builder;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (table: string) => query(table) }),
}));
vi.mock("@/lib/db/mappers", () => ({
  rowToEmployee: (row: Row) => ({
    id: row.id,
    userId: row.user_id ?? null,
    status: row.status,
    version: row.version,
    focusAreaIds: row.focus_area_ids ?? [1],
    suspendedAt: row.suspended_at ?? null,
    archivedAt: row.archived_at ?? null,
    plannedStatus: row.planned_status ?? null,
    plannedFrom: row.planned_from ?? null,
  }),
}));
vi.mock("@/lib/db/shared", () => ({
  EMPLOYEE_COLS: "*",
  cacheDel: vi.fn(),
  CacheKey: {
    orgUsers: () => "",
    orgDirectory: () => "",
    employees: () => "",
    allUsers: () => "",
  },
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
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  resolveEffectiveOrgId: (_req: unknown, _user: unknown, orgId: string) => Promise.resolve(orgId),
}));
vi.mock("@/app/api/employees/shared", () => ({
  canManageEmployees: (...args: unknown[]) => canManageEmployees(...args),
}));
vi.mock("@/lib/auth/revocation", () => ({
  endUserSessions: (...args: unknown[]) => endUserSessions(...args),
}));
vi.mock("@dubgrid/data-access", () => ({ disableMobilePushTokensForOrg: vi.fn() }));
vi.mock("@/features/employees/server/offboard-access", () => ({
  endOffboardedAccess: (...args: unknown[]) => endOffboardedAccess(...args),
}));
vi.mock("@/features/employees/server/suspension-notice", () => ({
  scheduleSuspensionNotice: (...args: unknown[]) => scheduleSuspensionNotice(...args),
}));
vi.mock("@/features/employees/server/org-today", () => ({
  fetchOrgToday: () => Promise.resolve("2026-10-28"),
}));

import { POST } from "./route";

const ME = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const id = (n: number) => `33333333-3333-4333-8333-33333333333${n}`;
const user = (n: number) => `44444444-4444-4444-8444-44444444444${n}`;

function employee(n: number, overrides: Row = {}): Row {
  return { id: id(n), org_id: ORG, user_id: user(n), status: "active", version: 1, ...overrides };
}

function request(body: Row) {
  return new NextRequest("http://localhost/api/employees/status/bulk", {
    method: "POST",
    body: JSON.stringify({ orgId: ORG, ...body }),
  });
}

function people(...ns: number[]) {
  return ns.map((n) => ({ empId: id(n), expectedVersion: 1 }));
}

async function results(response: Response) {
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    results: { empId: string; ok: boolean; error?: string; code?: string }[];
  };
  return body.results;
}

describe("POST /api/employees/status/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    failUpdateFor = null;
    for (const key of Object.keys(tables)) delete tables[key];
    tables.profiles = [{ id: ME, platform_role: "none" }];
    tables.organization_memberships = [
      { user_id: ME, org_id: ORG, org_role: "super_admin", archived_at: null },
    ];
    tables.audit_log = [];
    requireAuthenticatedUser.mockResolvedValue({ user: { id: ME, email: "me@example.com" } });
    requireSensitiveActionAuth.mockResolvedValue({ user: { id: ME } });
    validateCsrfOrigin.mockReturnValue(null);
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    canManageEmployees.mockResolvedValue(true);
  });

  it("stops at CSRF and sign-in", async () => {
    validateCsrfOrigin.mockReturnValueOnce(NextResponse.json({}, { status: 403 }));
    expect((await POST(request({ action: "markAway", people: people(1) }))).status).toBe(403);
    requireAuthenticatedUser.mockResolvedValueOnce({
      response: NextResponse.json({}, { status: 401 }),
    });
    expect((await POST(request({ action: "markAway", people: people(1) }))).status).toBe(401);
  });

  it("checks the rate limit once for the whole selection", async () => {
    tables.employees = [1, 2, 3, 4, 5].map((n) => employee(n));
    await results(await POST(request({ action: "markAway", people: people(1, 2, 3, 4, 5) })));
    expect(checkRateLimit).toHaveBeenCalledTimes(1);

    checkRateLimit.mockResolvedValueOnce({ limited: true, reset: Date.now() + 5000 });
    expect((await POST(request({ action: "markAway", people: people(1) }))).status).toBe(429);
  });

  it("refuses someone who can't manage staff", async () => {
    canManageEmployees.mockResolvedValue(false);
    const response = await POST(request({ action: "markAway", people: people(1) }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES });
  });

  it("asks a Gridmaster for fresh proof once, before changing anyone", async () => {
    tables.profiles = [{ id: ME, platform_role: "gridmaster" }];
    tables.organization_memberships = [];
    tables.employees = [employee(1), employee(2)];
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: NextResponse.json({ code: "STEP_UP_REQUIRED" }, { status: 401 }),
    });
    expect((await POST(request({ action: "archive", people: people(1, 2) }))).status).toBe(401);
    expect(tables.employees.every((row) => row.status === "active")).toBe(true);

    await results(await POST(request({ action: "markActive", people: people(1) })));
    expect(requireSensitiveActionAuth).toHaveBeenCalledTimes(1);
  });

  it("refuses a malformed selection", async () => {
    const bad = [
      { action: "markAway", people: [] },
      { action: "markAway", people: [...people(1), ...people(1)] },
      { action: "delete", people: people(1) },
      { action: "suspend", people: people(1), returnDate: "2027-01-04" },
      { action: "suspend", people: people(1), note: "why" },
      {
        action: "markAway",
        people: Array.from({ length: 101 }, (_, n) => ({
          empId: `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`,
          expectedVersion: 1,
        })),
      },
    ];
    for (const body of bad) expect((await POST(request(body))).status).toBe(400);
  });

  it("refuses a return date that isn't after today once", async () => {
    tables.employees = [employee(1)];
    const response = await POST(
      request({ action: "markAway", people: people(1), returnDate: "2026-10-28" }),
    );
    expect(response.status).toBe(400);
    expect(tables.employees[0].status).toBe("active");
  });

  it("reports each person, and one refusal or failure never stops the rest", async () => {
    tables.employees = [
      employee(1, { note: "" }),
      employee(2, { status: "inactive" }),
      employee(3, { version: 2 }),
      employee(4),
      employee(5, { user_id: ME }),
      employee(6),
    ];
    failUpdateFor = id(4);

    const list = await results(
      await POST(
        request({
          action: "markAway",
          people: people(1, 2, 3, 4, 5, 6),
          note: "Unit closed",
          returnDate: "2027-01-04",
        }),
      ),
    );

    expect(list.map((r) => [r.ok, r.code ?? null])).toEqual([
      [true, null],
      [false, "STATUS_NOT_APPLICABLE"],
      [false, "EMPLOYEE_STATUS_CONFLICT"],
      [false, null],
      [false, "SELF_ACTION_FORBIDDEN"],
      [true, null],
    ]);
    expect(list[1].error).toBe("Already Away.");
    expect(list[2]).toMatchObject({ employee: { id: id(3), version: 2 } });
    expect(list[3].error).toBe(API_ERRORS.UNEXPECTED);
    expect(captureException).toHaveBeenCalledTimes(1);

    const byId = Object.fromEntries(tables.employees.map((row) => [row.id, row]));
    expect(byId[id(1)]).toMatchObject({
      status: "inactive",
      status_note: "Unit closed",
      away_until: "2027-01-04",
    });
    expect(byId[id(6)]).toMatchObject({ status: "inactive", away_until: "2027-01-04" });
    expect(tables.audit_log.map((row) => [row.resource_id, row.action])).toEqual([
      [id(1), "employee.deactivated"],
      [id(6), "employee.deactivated"],
    ]);
  });

  it("brings back only the people each way back applies to", async () => {
    tables.employees = [
      employee(1, { status: "inactive" }),
      employee(2, { status: "removed", archived_at: "2026-10-01" }),
    ];
    const list = await results(await POST(request({ action: "restore", people: people(1, 2) })));
    expect(list.map((r) => r.ok)).toEqual([false, true]);
    expect(list[0].error).toBe("Only someone offboarded can be restored.");
    expect(tables.employees[1]).toMatchObject({ status: "active", archived_at: null });
  });

  it("suspends and offboards each person with the single route's follow-ups", async () => {
    tables.employees = [employee(1), employee(2, { user_id: null })];
    const suspended = await results(
      await POST(request({ action: "suspend", people: people(1, 2) })),
    );
    expect(suspended.map((r) => r.ok)).toEqual([true, false]);
    expect(suspended[1].error).toBe("Only someone with an account can be suspended.");
    expect(endUserSessions).toHaveBeenCalledWith(user(1));
    expect(scheduleSuspensionNotice).toHaveBeenCalledTimes(1);

    tables.employees[0].version = 2;
    tables.employees[1].version = 1;
    await results(
      await POST(
        request({
          action: "archive",
          people: [
            { empId: id(1), expectedVersion: 2 },
            { empId: id(2), expectedVersion: 1 },
          ],
        }),
      ),
    );
    expect(endOffboardedAccess).toHaveBeenCalledTimes(2);
  });

  it("never suspends every Super Admin, even one after another", async () => {
    tables.organization_memberships = [
      { user_id: ME, org_id: ORG, org_role: "admin", archived_at: null },
      { user_id: user(1), org_id: ORG, org_role: "super_admin", archived_at: null },
      { user_id: user(2), org_id: ORG, org_role: "super_admin", archived_at: null },
    ];
    tables.employees = [employee(1), employee(2)];

    const list = await results(await POST(request({ action: "suspend", people: people(1, 2) })));

    expect(list.map((r) => r.ok)).toEqual([true, false]);
    expect(list[1].error).toBe(
      "They're the only Super Admin who can sign in. Transfer ownership first.",
    );
    expect(tables.employees[1].suspended_at ?? null).toBeNull();
  });
});
