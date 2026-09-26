import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedUser = vi.fn();
const resolveEffectiveOrgId = vi.fn();
const getServiceClient = vi.fn();
const canManageEmployees = vi.fn();
const validateStaffOrgReferences = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const isGridmasterActor = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));
vi.mock("@/app/api/employees/shared", () => ({
  canManageEmployees: (...args: unknown[]) => canManageEmployees(...args),
  isGridmasterActor: (...args: unknown[]) => isGridmasterActor(...args),
}));
vi.mock("@/lib/staff-validation", () => ({
  buildStaffValidationErrorResponse: () =>
    new Response(JSON.stringify({ error: "invalid" }), { status: 422 }),
  getStaffFieldErrorsFromZod: () => ({}),
  validateStaffOrgReferences: (...args: unknown[]) => validateStaffOrgReferences(...args),
}));
vi.mock("@dubgrid/contracts", async () => {
  const { z } = await import("zod");
  return {
    optionalUsPhoneSchema: z.string().optional(),
    staffNameSchema: z.string(),
  };
});

const REAL_ORG_ID = "11111111-1111-1111-1111-111111111111";
const SANDBOX_ORG_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "33333333-3333-3333-3333-333333333333";
const ACTOR_ID = "44444444-4444-4444-4444-444444444444";

function buildServiceClient(opts: { targetIsMember?: boolean; departmentIds?: number[] } = {}) {
  const targetIsMember = opts.targetIsMember ?? true;
  const departmentIds = opts.departmentIds ?? [];
  const update = vi.fn().mockReturnValue({
    eq: () => ({
      eq: () => ({ is: async () => ({ error: null }) }),
    }),
  });
  const select = vi.fn().mockReturnValue({
    eq: () => ({
      eq: () => ({
        is: () => ({
          maybeSingle: async () => ({
            data: targetIsMember
              ? { user_id: USER_ID, department_ids: departmentIds, dept_admin_ids: [] }
              : null,
            error: null,
          }),
        }),
      }),
    }),
  });
  return {
    from: (table: string) => {
      if (table === "profiles") {
        return { update: () => ({ eq: async () => ({ error: null }) }) };
      }
      if (table === "organization_memberships") {
        return { update, select };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://app.test/api/organizations/app-only-user", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
  requireAuthenticatedUser.mockResolvedValue({ user: { id: ACTOR_ID } });
  getServiceClient.mockReturnValue(buildServiceClient());
  canManageEmployees.mockResolvedValue(true);
  validateStaffOrgReferences.mockResolvedValue({});
  isGridmasterActor.mockResolvedValue(false);
  requireSensitiveActionAuth.mockResolvedValue({ user: { id: ACTOR_ID } });
});

describe("PATCH /api/organizations/app-only-user", () => {
  it("routes the permission check and mutation to the sandbox-effective org, not the raw body orgId", async () => {
    resolveEffectiveOrgId.mockResolvedValue(SANDBOX_ORG_ID);

    const { PATCH } = await import("./route");
    const res = await PATCH(
      makeRequest({ orgId: REAL_ORG_ID, userId: USER_ID, phone: "+15551234567" }),
    );

    expect(res.status).toBe(200);
    expect(resolveEffectiveOrgId).toHaveBeenCalledWith(expect.anything(), ACTOR_ID, REAL_ORG_ID);
    // canManageEmployees must be checked against the effective org, never the raw one.
    expect(canManageEmployees).toHaveBeenCalledWith(expect.anything(), ACTOR_ID, SANDBOX_ORG_ID);
    expect(validateStaffOrgReferences).toHaveBeenCalledWith(
      expect.anything(),
      SANDBOX_ORG_ID,
      expect.anything(),
    );
  });

  it("uses the raw orgId as-is when the caller is not sandboxed", async () => {
    resolveEffectiveOrgId.mockResolvedValue(REAL_ORG_ID);

    const { PATCH } = await import("./route");
    const res = await PATCH(
      makeRequest({ orgId: REAL_ORG_ID, userId: USER_ID, firstName: "Jane" }),
    );

    expect(res.status).toBe(200);
    expect(canManageEmployees).toHaveBeenCalledWith(expect.anything(), ACTOR_ID, REAL_ORG_ID);
  });

  it("returns 403 when the caller cannot manage employees in the effective org", async () => {
    resolveEffectiveOrgId.mockResolvedValue(REAL_ORG_ID);
    canManageEmployees.mockResolvedValue(false);

    const { PATCH } = await import("./route");
    const res = await PATCH(
      makeRequest({ orgId: REAL_ORG_ID, userId: USER_ID, firstName: "Jane" }),
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 and never touches the profiles table when the target userId isn't a member of orgId", async () => {
    resolveEffectiveOrgId.mockResolvedValue(REAL_ORG_ID);
    const serviceClient = buildServiceClient({ targetIsMember: false });
    const profilesFrom = vi.fn(serviceClient.from);
    getServiceClient.mockReturnValue({ from: profilesFrom });

    const { PATCH } = await import("./route");
    const otherOrgUserId = "55555555-5555-5555-5555-555555555555";
    const res = await PATCH(
      makeRequest({ orgId: REAL_ORG_ID, userId: otherOrgUserId, firstName: "Pwned" }),
    );

    expect(res.status).toBe(404);
    expect(profilesFrom).not.toHaveBeenCalledWith("profiles");
  });
});

describe("a Gridmaster's management-department change (41d3, F-68)", () => {
  function staleSession() {
    return {
      response: new Response(JSON.stringify({ code: "STEP_UP_REQUIRED" }), { status: 403 }),
    };
  }

  it("changes no departments on a stale session", async () => {
    isGridmasterActor.mockResolvedValue(true);
    requireSensitiveActionAuth.mockResolvedValue(staleSession());
    resolveEffectiveOrgId.mockResolvedValue(REAL_ORG_ID);
    const client = buildServiceClient({ departmentIds: [1] });
    getServiceClient.mockReturnValue(client);
    const updateSpy = vi.spyOn(client, "from");

    const { PATCH } = await import("./route");
    const res = await PATCH(
      makeRequest({ orgId: REAL_ORG_ID, userId: USER_ID, departmentIds: [1, 2] }),
    );

    expect(res.status).toBe(403);
    expect(updateSpy).not.toHaveBeenCalledWith("profiles");
    const membershipCalls = updateSpy.mock.results
      .map((result) => result.value as { update?: ReturnType<typeof vi.fn> })
      .filter((value) => value.update);
    for (const value of membershipCalls) expect(value.update).not.toHaveBeenCalled();
  });

  it("asks nothing of a Gridmaster whose save leaves the departments alone", async () => {
    isGridmasterActor.mockResolvedValue(true);
    resolveEffectiveOrgId.mockResolvedValue(REAL_ORG_ID);
    getServiceClient.mockReturnValue(buildServiceClient({ departmentIds: [2, 1] }));

    const { PATCH } = await import("./route");
    const res = await PATCH(
      makeRequest({ orgId: REAL_ORG_ID, userId: USER_ID, firstName: "Ada", departmentIds: [1, 2] }),
    );

    expect(res.status).toBe(200);
    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
  });

  it("asks an organization admin for no fresh proof", async () => {
    resolveEffectiveOrgId.mockResolvedValue(REAL_ORG_ID);
    getServiceClient.mockReturnValue(buildServiceClient({ departmentIds: [1] }));

    const { PATCH } = await import("./route");
    const res = await PATCH(
      makeRequest({ orgId: REAL_ORG_ID, userId: USER_ID, departmentIds: [1, 2] }),
    );

    expect(res.status).toBe(200);
    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
  });
});
