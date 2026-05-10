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
    orgDirectory: (orgId: string) => `org-directory:${orgId}`,
    tenantStats: () => "tenant-stats",
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

import { POST as createFromUser } from "@/app/api/employees/from-user/route";
import { POST as reconcileFromUser } from "@/app/api/employees/from-user/reconcile/route";

function makeSelectBuilder(
  result: unknown,
  finalMethod: "maybeSingle" | "single" | "limit" = "maybeSingle",
) {
  const response = { data: result, error: null };
  const chain = {
    ...response,
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    is: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => response),
    single: vi.fn(() => response),
  };

  if (finalMethod === "single") {
    chain.single = vi.fn(() => response);
  }
  if (finalMethod === "limit") {
    chain.limit = vi.fn(() => chain);
  }

  return chain;
}

function makeInsertBuilder(result: unknown) {
  const response = { data: result, error: null };
  const chain = {
    select: vi.fn(() => chain),
    single: vi.fn(() => response),
  };

  return {
    insert: vi.fn(() => chain),
  };
}

function makeAuditInsertBuilder() {
  return {
    insert: vi.fn(() => ({ error: null })),
  };
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/employees/from-user", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const requestBody = {
  orgId: "33333333-3333-4333-8333-333333333333",
  userId: "22222222-2222-4222-8222-222222222222",
  firstName: "Alyce",
  lastName: "Smyth",
  email: "alice@example.com",
  phone: "(415) 425-3334",
  certificationId: null,
  focusAreaIds: [1],
  roleIds: [7],
  contactNotes: "Internal note",
};

const activeBillingRow = {
  suspended_at: null,
  subscription_status: "active",
  trial_ends_at: null,
};

describe("POST /api/employees/from-user", () => {
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

  it("returns NAME_MISMATCH when the submitted name differs from the account name", async () => {
    from
      .mockImplementationOnce(() =>
        makeSelectBuilder({
          org_role: "admin",
          admin_permissions: { canManageEmployees: true },
        }),
      )
      .mockImplementationOnce(() =>
        makeSelectBuilder({ platform_role: "none" }, "single"),
      )
      .mockImplementationOnce(() => makeSelectBuilder(activeBillingRow))
      .mockImplementationOnce(() => makeSelectBuilder([{ id: 1 }]))
      .mockImplementationOnce(() => makeSelectBuilder([{ id: 7 }]))
      .mockImplementationOnce(() =>
        makeSelectBuilder({ user_id: requestBody.userId }),
      )
      .mockImplementationOnce(() => makeSelectBuilder([], "limit"))
      .mockImplementationOnce(() => makeSelectBuilder({ seniority: 4 }))
      .mockImplementationOnce(() =>
        makeSelectBuilder({ first_name: "Alice", last_name: "Smith" }),
      );

    const response = await createFromUser(makeRequest(requestBody));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        code: "NAME_MISMATCH",
        details: expect.objectContaining({
          employeeId: null,
          employeeFirstName: "Alyce",
          employeeLastName: "Smyth",
          accountFirstName: "Alice",
          accountLastName: "Smith",
        }),
      }),
    );
  });
});

describe("POST /api/employees/from-user/reconcile", () => {
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

  it("creates the linked employee using the account profile name", async () => {
    const insertBuilder = makeInsertBuilder({
      id: "emp-99",
      org_id: requestBody.orgId,
      first_name: "Alice",
      last_name: "Smith",
      status: "active",
      status_changed_at: null,
      status_note: "",
      certification_id: null,
      role_ids: [7],
      seniority: 5,
      focus_area_ids: [1],
      phone: "(415) 425-3334",
      email: "alice@example.com",
      contact_notes: "Internal note",
      archived_at: null,
      user_id: requestBody.userId,
      department_ids: [],
      dept_admin_ids: [],
      version: 0,
    });
    const auditBuilder = makeAuditInsertBuilder();

    from
      .mockImplementationOnce(() =>
        makeSelectBuilder({
          org_role: "admin",
          admin_permissions: { canManageEmployees: true },
        }),
      )
      .mockImplementationOnce(() =>
        makeSelectBuilder({ platform_role: "none" }, "single"),
      )
      .mockImplementationOnce(() => makeSelectBuilder(activeBillingRow))
      .mockImplementationOnce(() => makeSelectBuilder([{ id: 1 }]))
      .mockImplementationOnce(() => makeSelectBuilder([{ id: 7 }]))
      .mockImplementationOnce(() =>
        makeSelectBuilder({ user_id: requestBody.userId }),
      )
      .mockImplementationOnce(() => makeSelectBuilder([], "limit"))
      .mockImplementationOnce(() => makeSelectBuilder({ seniority: 4 }))
      .mockImplementationOnce(() =>
        makeSelectBuilder({ first_name: "Alice", last_name: "Smith" }),
      )
      .mockImplementationOnce(() => insertBuilder)
      .mockImplementationOnce(() => auditBuilder);

    const response = await reconcileFromUser(makeRequest(requestBody));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        employee: expect.objectContaining({
          firstName: "Alice",
          lastName: "Smith",
          userId: requestBody.userId,
        }),
      }),
    );
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        first_name: "Alice",
        last_name: "Smith",
        user_id: requestBody.userId,
      }),
    );
    expect(auditBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          nameReconciled: true,
          resolution: "use_account_name",
          submittedFirstName: "Alyce",
          submittedLastName: "Smyth",
        }),
      }),
    );
    expect(cacheDel).toHaveBeenCalled();
  });
});
