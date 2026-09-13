import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const checkRateLimit = vi.fn();
const canManageEmployees = vi.fn();
const findAuthUserByEmail = vi.fn();
const profileMaybeSingle = vi.fn();
const membershipMaybeSingle = vi.fn();
const employeeMaybeSingle = vi.fn();

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
const MATCHED_USER_ID = "22222222-2222-2222-2222-222222222222";
const EMPLOYEE_ID = "33333333-3333-3333-3333-333333333333";

function makeChain(maybeSingle: () => unknown) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    maybeSingle,
  };
  return chain;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "profiles") return makeChain(() => profileMaybeSingle());
      if (table === "organization_memberships") return makeChain(() => membershipMaybeSingle());
      return makeChain(() => employeeMaybeSingle());
    },
  }),
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.test/api/users/check-email", {
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
  findAuthUserByEmail.mockResolvedValue(null);
  profileMaybeSingle.mockResolvedValue({ data: null, error: null });
  membershipMaybeSingle.mockResolvedValue({ data: null, error: null });
  employeeMaybeSingle.mockResolvedValue({ data: null, error: null });
});

describe("POST /api/users/check-email", () => {
  it("rejects a cross-origin request before authentication", async () => {
    const { POST } = await importRoute();
    const req = makeRequest({ email: "nobody@test.com", orgId: ORG_ID });
    req.headers.set("origin", "https://attacker.test");

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(requireAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("reports no match when the email has no account", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ email: "nobody@test.com", orgId: ORG_ID }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      exists: false,
      displayName: null,
      existsInThisOrg: false,
      existingEmployeeId: null,
    });
    expect(profileMaybeSingle).not.toHaveBeenCalled();
  });

  it("reports a match with the profile's display name, org membership, and employee id", async () => {
    findAuthUserByEmail.mockResolvedValue({
      id: MATCHED_USER_ID,
      email: "taken@test.com",
      emailConfirmed: true,
    });
    profileMaybeSingle.mockResolvedValue({
      data: { first_name: "Jane", last_name: "Doe" },
      error: null,
    });
    membershipMaybeSingle.mockResolvedValue({ data: { user_id: MATCHED_USER_ID }, error: null });
    employeeMaybeSingle.mockResolvedValue({ data: { id: EMPLOYEE_ID }, error: null });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ email: "taken@test.com", orgId: ORG_ID }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      exists: true,
      displayName: "Jane Doe",
      existsInThisOrg: true,
      existingEmployeeId: EMPLOYEE_ID,
    });
  });

  it("reports a match outside this org without an employee id", async () => {
    findAuthUserByEmail.mockResolvedValue({
      id: MATCHED_USER_ID,
      email: "elsewhere@test.com",
      emailConfirmed: true,
    });
    profileMaybeSingle.mockResolvedValue({ data: null, error: null });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ email: "elsewhere@test.com", orgId: ORG_ID }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      exists: true,
      displayName: null,
      existsInThisOrg: false,
      existingEmployeeId: null,
    });
  });

  it("reports no match for a Gridmaster account, without revealing its name or existence", async () => {
    findAuthUserByEmail.mockResolvedValue({
      id: MATCHED_USER_ID,
      email: "gridmaster@test.com",
      emailConfirmed: true,
    });
    profileMaybeSingle.mockResolvedValue({
      data: { first_name: "Alex", last_name: "Admin", platform_role: "gridmaster" },
      error: null,
    });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ email: "gridmaster@test.com", orgId: ORG_ID }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      exists: false,
      displayName: null,
      existsInThisOrg: false,
      existingEmployeeId: null,
    });
  });

  it("returns 403 when the caller cannot manage employees", async () => {
    canManageEmployees.mockResolvedValue(false);

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ email: "taken@test.com", orgId: ORG_ID }));

    expect(res.status).toBe(403);
    expect(findAuthUserByEmail).not.toHaveBeenCalled();
  });

  it("rejects an invalid body", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ email: "not-an-email", orgId: ORG_ID }));

    expect(res.status).toBe(400);
  });
});
