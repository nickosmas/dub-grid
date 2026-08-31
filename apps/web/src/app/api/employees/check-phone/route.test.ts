import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const checkRateLimit = vi.fn();
const canManageEmployees = vi.fn();
const employeesSelect = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/app/api/employees/shared", () => ({
  canManageEmployees: (...args: unknown[]) => canManageEmployees(...args),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_EMPLOYEE_ID = "22222222-2222-2222-2222-222222222222";
const SELF_EMPLOYEE_ID = "33333333-3333-3333-3333-333333333333";

function makeQueryChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    is: () => employeesSelect(),
  };
  return chain;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => makeQueryChain(),
  }),
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.test/api/employees/check-phone", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function importRoute() {
  return import("./route");
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUser.mockResolvedValue({ user: { id: "actor-1" } });
  checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
  canManageEmployees.mockResolvedValue(true);
});

describe("POST /api/employees/check-phone", () => {
  it("reports no conflict when the phone is free", async () => {
    employeesSelect.mockResolvedValue({
      data: [{ id: OTHER_EMPLOYEE_ID, phone: "(415) 555-0100" }],
      error: null,
    });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ phone: "(415) 555-0199", orgId: ORG_ID }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ conflict: false, conflictingEmployeeId: null });
  });

  it("reports a conflict when another active employee's phone matches by digits, ignoring formatting", async () => {
    employeesSelect.mockResolvedValue({
      data: [{ id: OTHER_EMPLOYEE_ID, phone: "415-555-0100" }],
      error: null,
    });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ phone: "(415) 555-0100", orgId: ORG_ID }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      conflict: true,
      conflictingEmployeeId: OTHER_EMPLOYEE_ID,
    });
  });

  it("excludes the given employee id from the conflict check", async () => {
    employeesSelect.mockResolvedValue({
      data: [{ id: SELF_EMPLOYEE_ID, phone: "(415) 555-0100" }],
      error: null,
    });

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        phone: "(415) 555-0100",
        orgId: ORG_ID,
        excludeEmployeeId: SELF_EMPLOYEE_ID,
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ conflict: false, conflictingEmployeeId: null });
  });

  it("returns 403 when the caller cannot manage employees", async () => {
    canManageEmployees.mockResolvedValue(false);

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ phone: "(415) 555-0100", orgId: ORG_ID }));

    expect(res.status).toBe(403);
    expect(employeesSelect).not.toHaveBeenCalled();
  });
});
