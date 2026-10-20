import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const requireOrgPermissions = vi.fn();
const checkRateLimit = vi.fn();
const isFeatureEnabled = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/app/api/shared/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/shared/permissions")>()),
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: (...args: unknown[]) => isFeatureEnabled(...args),
}));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

const REQUESTED_ORG_ID = "11111111-1111-4111-8111-111111111111";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";

function makeRequest(orgId: string) {
  const url = new URL("http://localhost/api/export");
  url.searchParams.set("type", "staff");
  url.searchParams.set("orgId", orgId);
  return new NextRequest(url);
}

function createServiceClientMock(
  tables: { employees?: Array<Record<string, unknown>>; internalIds?: string[] } = {},
) {
  const orgIdFilters: string[] = [];
  const auditInsert = vi.fn().mockResolvedValue({ error: null });

  const serviceClient = {
    from(table: string) {
      if (table === "audit_log") {
        return { insert: auditInsert };
      }

      let rows: Array<Record<string, unknown>> =
        table === "employees"
          ? (tables.employees ?? [])
          : table === "profiles"
            ? (tables.internalIds ?? []).map((id) => ({ id }))
            : [];
      const query = {
        select() {
          return query;
        },
        or(filter: string) {
          const dropped = filter.match(/not\.in\.\((.*)\)$/)?.[1]?.split(",") ?? [];
          rows = rows.filter(
            (row) => row.user_id == null || !dropped.includes(String(row.user_id)),
          );
          return query;
        },
        eq(column: string, value: string) {
          if (column === "org_id") orgIdFilters.push(value);
          return query;
        },
        is() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        then<TResult1 = unknown, TResult2 = never>(
          onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  };

  return { serviceClient, orgIdFilters, auditInsert };
}

describe("GET /api/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUser.mockResolvedValue({
      user: { id: "user-1", email: "staff@example.com" },
    });
    checkRateLimit.mockResolvedValue({ limited: false, reset: null, misconfigured: false });
    isFeatureEnabled.mockResolvedValue(true);
  });

  it("exports and audits the effective sandbox Organization, never the raw query id", async () => {
    const { serviceClient, orgIdFilters, auditInsert } = createServiceClientMock();
    requireOrgPermissions.mockResolvedValue({
      orgId: SANDBOX_ORG_ID,
      serviceClient,
      actor: { id: "user-1" },
      permissions: { isGridmaster: false },
    });

    const { GET } = await import("./route");
    const response = await GET(makeRequest(REQUESTED_ORG_ID));

    expect(response.status).toBe(200);
    expect(orgIdFilters).toContain(SANDBOX_ORG_ID);
    expect(orgIdFilters).not.toContain(REQUESTED_ORG_ID);
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ org_id: SANDBOX_ORG_ID }));
  });

  it("leaves internal accounts out of a client's staff export, not a Gridmaster's", async () => {
    const employees = [
      { id: "e1", first_name: "Rosa", last_name: "Member", user_id: "member-1" },
      { id: "e2", first_name: "QA", last_name: "Admin", user_id: "qa-person" },
      { id: "e3", first_name: "Ida", last_name: "NoAccount", user_id: null },
    ];
    const { GET } = await import("./route");
    async function exportFor(isGridmaster: boolean) {
      const { serviceClient } = createServiceClientMock({ employees, internalIds: ["qa-person"] });
      requireOrgPermissions.mockResolvedValue({
        orgId: REQUESTED_ORG_ID,
        serviceClient,
        actor: { id: "user-1" },
        permissions: { isGridmaster },
      });
      return (await GET(makeRequest(REQUESTED_ORG_ID))).text();
    }

    const forClient = await exportFor(false);
    expect(forClient).toContain("Rosa");
    expect(forClient).toContain("Ida");
    expect(forClient).not.toContain("QA");
    expect(await exportFor(true)).toContain("QA");
  });

  it("gates staff export on employee details and schedule export on shift editing", async () => {
    requireOrgPermissions.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });
    const { GET } = await import("./route");

    await GET(makeRequest(REQUESTED_ORG_ID));
    const staffAllowed = requireOrgPermissions.mock.calls[0][2];
    expect(
      staffAllowed({ isGridmaster: false, isSuperAdmin: false, canViewEmployeeDetails: true }),
    ).toBe(true);
    expect(
      staffAllowed({ isGridmaster: false, isSuperAdmin: false, canViewEmployeeDetails: false }),
    ).toBe(false);

    const scheduleUrl = new URL("http://localhost/api/export");
    scheduleUrl.searchParams.set("type", "schedule");
    scheduleUrl.searchParams.set("orgId", REQUESTED_ORG_ID);
    await GET(new NextRequest(scheduleUrl));
    const scheduleAllowed = requireOrgPermissions.mock.calls[1][2];
    expect(scheduleAllowed({ isGridmaster: false, isSuperAdmin: false, canEditShifts: true })).toBe(
      true,
    );
    expect(
      scheduleAllowed({
        isGridmaster: false,
        isSuperAdmin: false,
        canEditShifts: false,
        canViewSchedule: true,
      }),
    ).toBe(false);
  });

  it("refuses a schedule range that is not a calendar date", async () => {
    const { GET } = await import("./route");
    const url = new URL("http://localhost/api/export");
    url.searchParams.set("type", "schedule");
    url.searchParams.set("orgId", REQUESTED_ORG_ID);
    url.searchParams.set("startDate", "next week");
    url.searchParams.set("endDate", "2026-02-30");

    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(400);
  });
});
