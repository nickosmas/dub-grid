import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const validateCsrfOrigin = vi.fn();
const checkRateLimit = vi.fn();
const cacheDel = vi.fn();
const from = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("@/lib/cache", () => ({
  cacheDel: (...args: unknown[]) => cacheDel(...args),
  CacheKey: {
    employees: (orgId: string) => `employees:${orgId}`,
    employeeDetail: (employeeId: string) => `employee:${employeeId}`,
    orgUsers: (orgId: string) => `org-users:${orgId}`,
    orgDirectory: (orgId: string) => `org-directory:${orgId}`,
  },
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn() },
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => from(table),
  }),
}));

import { POST as linkUser } from "@/app/api/employees/link-user/route";
import { POST as reconcileLinkUser } from "@/app/api/employees/link-user/reconcile/route";

function makeSelectBuilder(result: unknown, finalMethod: "maybeSingle" | "single" | "limit" = "maybeSingle") {
  const response = { data: result, error: null };
  const chain = {
    ...response,
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    maybeSingle: vi.fn(() => response),
    single: vi.fn(() => response),
    limit: vi.fn(() => chain),
  };

  if (finalMethod === "single") {
    chain.single = vi.fn(() => response);
  }
  if (finalMethod === "limit") {
    chain.limit = vi.fn(() => chain);
  }

  return chain;
}

function makeUpdateBuilder() {
  const result = { error: null };
  const chain = {
    ...result,
    eq: vi.fn(() => chain),
  };

  return {
    update: vi.fn(() => chain),
  };
}

function makeInsertBuilder() {
  return {
    insert: vi.fn(() => ({ error: null })),
  };
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/employees/link-user", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/employees/link-user", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUser.mockResolvedValue({
      user: { id: "actor-1", email: "admin@example.com" },
    });
    checkRateLimit.mockResolvedValue({
      limited: false,
      reset: null,
      misconfigured: false,
    });
  });

  it("links when names match after trimming and case normalization", async () => {
    const updateBuilder = makeUpdateBuilder();
    const auditBuilder = makeInsertBuilder();

    from
      .mockImplementationOnce(() => makeSelectBuilder({ org_role: "admin", admin_permissions: { canManageEmployees: true } }))
      .mockImplementationOnce(() => makeSelectBuilder({ platform_role: "none" }, "single"))
      .mockImplementationOnce(() => makeSelectBuilder({ id: "emp-1", user_id: null, first_name: "Alice", last_name: "Smith" }))
      .mockImplementationOnce(() => makeSelectBuilder({ user_id: "user-1" }))
      .mockImplementationOnce(() => makeSelectBuilder([], "limit"))
      .mockImplementationOnce(() => makeSelectBuilder({ first_name: " alice ", last_name: "SMITH" }))
      .mockImplementationOnce(() => updateBuilder)
      .mockImplementationOnce(() => auditBuilder);

    const response = await linkUser(makeRequest({
      employeeId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      orgId: "33333333-3333-4333-8333-333333333333",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "linked" });
    expect(updateBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "22222222-2222-4222-8222-222222222222",
      updated_by: "actor-1",
    }));
    expect(auditBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      details: { linkedUserId: "22222222-2222-4222-8222-222222222222" },
    }));
    expect(cacheDel).toHaveBeenCalled();
  });

  it("returns NAME_MISMATCH when the employee and account names differ", async () => {
    from
      .mockImplementationOnce(() => makeSelectBuilder({ org_role: "admin", admin_permissions: { canManageEmployees: true } }))
      .mockImplementationOnce(() => makeSelectBuilder({ platform_role: "none" }, "single"))
      .mockImplementationOnce(() => makeSelectBuilder({ id: "emp-1", user_id: null, first_name: "Alice", last_name: "Smith" }))
      .mockImplementationOnce(() => makeSelectBuilder({ user_id: "user-1" }))
      .mockImplementationOnce(() => makeSelectBuilder([], "limit"))
      .mockImplementationOnce(() => makeSelectBuilder({ first_name: "Alicia", last_name: "Smith" }));

    const response = await linkUser(makeRequest({
      employeeId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      orgId: "33333333-3333-4333-8333-333333333333",
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: "NAME_MISMATCH",
      details: expect.objectContaining({
        employeeFirstName: "Alice",
        employeeLastName: "Smith",
        accountFirstName: "Alicia",
        accountLastName: "Smith",
      }),
    }));
    expect(cacheDel).not.toHaveBeenCalled();
  });
});

describe("POST /api/employees/link-user/reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUser.mockResolvedValue({
      user: { id: "actor-1", email: "admin@example.com" },
    });
    checkRateLimit.mockResolvedValue({
      limited: false,
      reset: null,
      misconfigured: false,
    });
  });

  it("updates the employee record to the account name and links it", async () => {
    const updateBuilder = makeUpdateBuilder();
    const auditBuilder = makeInsertBuilder();

    from
      .mockImplementationOnce(() => makeSelectBuilder({ org_role: "admin", admin_permissions: { canManageEmployees: true } }))
      .mockImplementationOnce(() => makeSelectBuilder({ platform_role: "none" }, "single"))
      .mockImplementationOnce(() => makeSelectBuilder({ id: "emp-1", user_id: null, first_name: "Alyce", last_name: "Smyth" }))
      .mockImplementationOnce(() => makeSelectBuilder({ user_id: "user-1" }))
      .mockImplementationOnce(() => makeSelectBuilder([], "limit"))
      .mockImplementationOnce(() => makeSelectBuilder({ first_name: "Alice", last_name: "Smith" }))
      .mockImplementationOnce(() => updateBuilder)
      .mockImplementationOnce(() => auditBuilder);

    const response = await reconcileLinkUser(makeRequest({
      employeeId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      orgId: "33333333-3333-4333-8333-333333333333",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "linked" });
    expect(updateBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      first_name: "Alice",
      last_name: "Smith",
      user_id: "22222222-2222-4222-8222-222222222222",
    }));
    expect(auditBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        nameReconciled: true,
        resolution: "use_account_name",
        previousEmployeeFirstName: "Alyce",
        previousEmployeeLastName: "Smyth",
        accountFirstName: "Alice",
        accountLastName: "Smith",
      }),
    }));
  });

  it("rejects callers without employee-management permission", async () => {
    from
      .mockImplementationOnce(() => makeSelectBuilder({ org_role: "user", admin_permissions: null }))
      .mockImplementationOnce(() => makeSelectBuilder({ platform_role: "none" }, "single"));

    const response = await reconcileLinkUser(makeRequest({
      employeeId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      orgId: "33333333-3333-4333-8333-333333333333",
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Insufficient permissions" });
  });
});
