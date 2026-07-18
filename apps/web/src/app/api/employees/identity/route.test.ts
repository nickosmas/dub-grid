import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedUser = vi.fn();
const checkRateLimit = vi.fn();
const resolveEffectiveOrgId = vi.fn();
const getServiceClient = vi.fn();
const canManageEmployees = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { __limiter: true },
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));
vi.mock("@/app/api/employees/shared", () => ({
  canManageEmployees: (...args: unknown[]) => canManageEmployees(...args),
}));
vi.mock("@/lib/employee-contact-conflicts", () => ({
  getEmployeeContactConflict: () => null,
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/staff-validation", () => ({
  buildStaffValidationErrorResponse: () => NextResponse.json({ error: "invalid" }, { status: 422 }),
  getStaffFieldErrorsFromZod: () => ({}),
}));
vi.mock("@dubgrid/contracts", async () => {
  const { z } = await import("zod");
  return {
    optionalStaffEmailSchema: z.string().optional(),
    optionalUsPhoneSchema: z.string(),
    staffNameSchema: z.string(),
  };
});

const REAL_ORG_ID = "11111111-1111-1111-1111-111111111111";
const SANDBOX_ORG_ID = "22222222-2222-2222-2222-222222222222";
const EMPLOYEE_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";
const ACTOR_ID = "55555555-5555-5555-5555-555555555555";

function dbEmployee(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: EMPLOYEE_ID,
    org_id: REAL_ORG_ID,
    employee_number: 1,
    first_name: "Old",
    last_name: "Name",
    employment_type: "full_time",
    status: "active",
    status_changed_at: null,
    status_note: "",
    certification_id: null,
    role_ids: [],
    seniority: 1,
    focus_area_ids: [1],
    phone: "",
    email: "",
    contact_notes: "",
    archived_at: null,
    user_id: USER_ID,
    department_ids: [],
    dept_admin_ids: [],
    version: 3,
    created_at: null,
    ...overrides,
  };
}

function makeServiceClient(opts: {
  current?: ReturnType<typeof dbEmployee>;
  updatedRow?: ReturnType<typeof dbEmployee> | null;
  auditInsert?: ReturnType<typeof vi.fn>;
  profileUpdate?: ReturnType<typeof vi.fn>;
}) {
  const employeeUpdate = vi.fn(() => ({
    eq: vi.fn(function this1() {
      return this1.bind({});
    }),
  }));
  const auditInsert = opts.auditInsert ?? vi.fn(async () => ({ error: null }));
  const profileUpdate =
    opts.profileUpdate ??
    vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    }));

  // Track which UPDATE select chain to return (updatedRow may be null).
  function buildUpdateChain() {
    const select = vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({
        data: opts.updatedRow === undefined ? (opts.current ?? null) : opts.updatedRow,
        error: null,
      })),
    }));
    const chain: { eq: (...args: unknown[]) => unknown; select: typeof select } = {
      eq: vi.fn(function eq() {
        return chain;
      }),
      select,
    };
    return chain;
  }

  function buildSelectChain(row: ReturnType<typeof dbEmployee> | null) {
    const single = vi.fn(async () => ({ data: row, error: null }));
    const chain: { eq: (...args: unknown[]) => unknown; single: typeof single } = {
      eq: vi.fn(function eq() {
        return chain;
      }),
      single,
    };
    return chain;
  }

  return {
    from: vi.fn((table: string) => {
      if (table === "employees") {
        return {
          select: vi.fn(() => buildSelectChain(opts.current ?? null)),
          update: vi.fn(() => buildUpdateChain()),
        };
      }
      if (table === "profiles") {
        return { update: profileUpdate };
      }
      if (table === "audit_log") {
        return { insert: auditInsert };
      }
      return {};
    }),
  };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.test/api/employees/identity", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

async function importRoute() {
  return import("./route");
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
  requireAuthenticatedUser.mockResolvedValue({ user: { id: ACTOR_ID, email: "actor@test.com" } });
  checkRateLimit.mockResolvedValue({ limited: false });
  resolveEffectiveOrgId.mockImplementation(async (_req, _uid, requested) => requested);
  canManageEmployees.mockResolvedValue(true);
});

describe("PATCH /api/employees/identity", () => {
  it("returns 429 when the rate limiter trips", async () => {
    checkRateLimit.mockResolvedValueOnce({ limited: true, reset: 1000 });
    const { PATCH } = await importRoute();
    const res = await PATCH(
      makeRequest({
        employeeId: EMPLOYEE_ID,
        orgId: REAL_ORG_ID,
        userId: USER_ID,
        firstName: "A",
        lastName: "B",
        phone: "",
        expectedVersion: 3,
      }),
    );
    expect(res.status).toBe(429);
    expect(getServiceClient).not.toHaveBeenCalled();
  });

  it("routes mutations through resolveEffectiveOrgId (sandbox redirect)", async () => {
    // Caller submits the real org id, but sandbox cookie should redirect to sandbox.
    resolveEffectiveOrgId.mockResolvedValueOnce(SANDBOX_ORG_ID);
    const service = makeServiceClient({
      current: dbEmployee({ org_id: SANDBOX_ORG_ID, version: 3 }),
      updatedRow: dbEmployee({ org_id: SANDBOX_ORG_ID, version: 4, first_name: "New" }),
    });
    getServiceClient.mockReturnValue(service);

    const { PATCH } = await importRoute();
    const res = await PATCH(
      makeRequest({
        employeeId: EMPLOYEE_ID,
        orgId: REAL_ORG_ID,
        userId: USER_ID,
        firstName: "New",
        lastName: "Name",
        phone: "",
        expectedVersion: 3,
      }),
    );

    expect(res.status).toBe(200);
    expect(resolveEffectiveOrgId).toHaveBeenCalledWith(expect.anything(), ACTOR_ID, REAL_ORG_ID);
    // Permission check ran against the SANDBOX org, not the body-supplied real org.
    expect(canManageEmployees).toHaveBeenCalledWith(expect.anything(), ACTOR_ID, SANDBOX_ORG_ID);
  });

  it("returns 409 EMPLOYEE_IDENTITY_CONFLICT when expectedVersion mismatches", async () => {
    const service = makeServiceClient({
      current: dbEmployee({ version: 7 }),
    });
    getServiceClient.mockReturnValue(service);

    const { PATCH } = await importRoute();
    const res = await PATCH(
      makeRequest({
        employeeId: EMPLOYEE_ID,
        orgId: REAL_ORG_ID,
        userId: USER_ID,
        firstName: "X",
        lastName: "Y",
        phone: "",
        expectedVersion: 3, // stale
      }),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("EMPLOYEE_IDENTITY_CONFLICT");
    expect(body.employee).toMatchObject({ version: 7 });
  });

  it("rejects 403 when the caller lacks canManageEmployees", async () => {
    canManageEmployees.mockResolvedValueOnce(false);
    getServiceClient.mockReturnValue(makeServiceClient({}));

    const { PATCH } = await importRoute();
    const res = await PATCH(
      makeRequest({
        employeeId: EMPLOYEE_ID,
        orgId: REAL_ORG_ID,
        userId: USER_ID,
        firstName: "A",
        lastName: "B",
        phone: "",
        expectedVersion: 3,
      }),
    );

    expect(res.status).toBe(403);
  });

  it("writes an audit_log entry with the changed PII fields", async () => {
    const auditInsert = vi.fn(
      async (_entry: {
        action: string;
        resource_type: string;
        details: { firstName: string; lastName: string; changedFields: string[] };
      }) => ({ error: null }),
    );
    const service = makeServiceClient({
      current: dbEmployee({
        first_name: "Old",
        last_name: "Name",
        phone: "",
        email: "old@x.com",
        version: 3,
      }),
      updatedRow: dbEmployee({
        first_name: "New",
        last_name: "Name",
        phone: "",
        email: "new@x.com",
        version: 4,
      }),
      auditInsert,
    });
    getServiceClient.mockReturnValue(service);

    const { PATCH } = await importRoute();
    const res = await PATCH(
      makeRequest({
        employeeId: EMPLOYEE_ID,
        orgId: REAL_ORG_ID,
        userId: USER_ID,
        firstName: "New",
        lastName: "Name",
        phone: "",
        email: "new@x.com",
        expectedVersion: 3,
      }),
    );

    expect(res.status).toBe(200);
    expect(auditInsert).toHaveBeenCalledTimes(1);
    const auditPayload = auditInsert.mock.calls[0]?.[0];
    expect(auditPayload?.action).toBe("employee.updated");
    expect(auditPayload?.resource_type).toBe("employee");
    expect(auditPayload?.details.firstName).toBe("New");
    expect(auditPayload?.details.lastName).toBe("Name");
    expect(auditPayload?.details.changedFields).toEqual(
      expect.arrayContaining(["firstName", "email"]),
    );
  });
});
