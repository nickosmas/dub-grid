import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const checkRateLimit = vi.fn();
const canManageEmployees = vi.fn();
const employeesMaybeSingle = vi.fn();
const findAuthUserByEmail = vi.fn();
const profilesMaybeSingle = vi.fn();

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
vi.mock("@/lib/supabase-admin-users", () => ({
  findAuthUserByEmail: (...args: unknown[]) => findAuthUserByEmail(...args),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_EMPLOYEE_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_USER_ID = "33333333-3333-3333-3333-333333333333";
const CURRENT_USER_ID = "44444444-4444-4444-4444-444444444444";
const OWNER_EMPLOYEE_ID = "55555555-5555-5555-5555-555555555555";

function makeEmployeesChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    ilike: () => chain,
    is: () => chain,
    neq: () => chain,
    limit: () => chain,
    maybeSingle: () => employeesMaybeSingle(),
  };
  return chain;
}

function makeProfilesChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => profilesMaybeSingle(),
  };
  return chain;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => (table === "profiles" ? makeProfilesChain() : makeEmployeesChain()),
  }),
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.test/api/employees/check-email", {
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
  // Default: no employees.email duplicate, no matching auth account.
  employeesMaybeSingle.mockResolvedValue({ data: null, error: null });
  findAuthUserByEmail.mockResolvedValue(null);
});

describe("POST /api/employees/check-email", () => {
  it("rejects a cross-origin request before authentication", async () => {
    const { POST } = await importRoute();
    const req = makeRequest({ email: "free@test.com", orgId: ORG_ID });
    req.headers.set("origin", "https://attacker.test");

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(requireAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("reports no conflict when the email is free", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ email: "free@test.com", orgId: ORG_ID }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ conflict: false, conflictingEmployeeId: null });
  });

  it("reports a conflict when another active employee already has the email as their contact email", async () => {
    employeesMaybeSingle.mockResolvedValueOnce({ data: { id: OTHER_EMPLOYEE_ID }, error: null });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ email: "taken@test.com", orgId: ORG_ID }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      conflict: true,
      conflictingEmployeeId: OTHER_EMPLOYEE_ID,
      reason: "employee_duplicate",
    });
    // The employee_duplicate case is a fast return — never reaches the
    // auth.users lookup at all.
    expect(findAuthUserByEmail).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller cannot manage employees", async () => {
    canManageEmployees.mockResolvedValue(false);

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ email: "taken@test.com", orgId: ORG_ID }));

    expect(res.status).toBe(403);
    expect(employeesMaybeSingle).not.toHaveBeenCalled();
  });

  it("rejects an invalid body", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ email: "not-an-email", orgId: ORG_ID }));

    expect(res.status).toBe(400);
  });

  // ── The auth.users-based cases: mirrors check_employee_email_belongs_to_user ──

  it("flags a Gridmaster's login email even though no employee row matches it", async () => {
    findAuthUserByEmail.mockResolvedValue({
      id: OTHER_USER_ID,
      email: "gridmaster@test.com",
      emailConfirmed: true,
    });
    profilesMaybeSingle.mockResolvedValue({ data: { platform_role: "gridmaster" }, error: null });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ email: "gridmaster@test.com", orgId: ORG_ID }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      conflict: true,
      conflictingEmployeeId: null,
      reason: "gridmaster",
    });
  });

  it("does not flag an employee's own linked login email", async () => {
    findAuthUserByEmail.mockResolvedValue({
      id: CURRENT_USER_ID,
      email: "self@test.com",
      emailConfirmed: true,
    });
    profilesMaybeSingle.mockResolvedValue({ data: { platform_role: "admin" }, error: null });

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        email: "self@test.com",
        orgId: ORG_ID,
        currentUserId: CURRENT_USER_ID,
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ conflict: false, conflictingEmployeeId: null });
  });

  it("flags an email belonging to a different account than the employee being edited is linked to", async () => {
    findAuthUserByEmail.mockResolvedValue({
      id: OTHER_USER_ID,
      email: "someone-elses-login@test.com",
      emailConfirmed: true,
    });
    profilesMaybeSingle.mockResolvedValue({ data: { platform_role: "admin" }, error: null });

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        email: "someone-elses-login@test.com",
        orgId: ORG_ID,
        currentUserId: CURRENT_USER_ID,
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      conflict: true,
      conflictingEmployeeId: null,
      reason: "other_account",
    });
  });

  it("flags an unlinked employee's typed email when its account owner already has an active employee row in this org", async () => {
    findAuthUserByEmail.mockResolvedValue({
      id: OTHER_USER_ID,
      email: "management-staff@test.com",
      emailConfirmed: true,
    });
    profilesMaybeSingle.mockResolvedValue({ data: { platform_role: "admin" }, error: null });
    // First employees.maybeSingle() call is the email-duplicate check (no
    // match); the second is the owner-employee-by-user_id lookup.
    employeesMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    employeesMaybeSingle.mockResolvedValueOnce({ data: { id: OWNER_EMPLOYEE_ID }, error: null });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ email: "management-staff@test.com", orgId: ORG_ID }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      conflict: true,
      conflictingEmployeeId: OWNER_EMPLOYEE_ID,
      reason: "other_account",
    });
  });

  it("does not flag an unlinked employee's typed email when its account owner has no active employee row in this org", async () => {
    findAuthUserByEmail.mockResolvedValue({
      id: OTHER_USER_ID,
      email: "cross-org-account@test.com",
      emailConfirmed: true,
    });
    profilesMaybeSingle.mockResolvedValue({ data: { platform_role: "admin" }, error: null });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ email: "cross-org-account@test.com", orgId: ORG_ID }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ conflict: false, conflictingEmployeeId: null });
  });
});
