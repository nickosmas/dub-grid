import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedUser = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const checkRateLimit = vi.fn();
const resolveEffectiveOrgId = vi.fn();
const createRequestSupabaseClient = vi.fn();
const apiErrorResponse = vi.fn((_err: unknown, fallback: string, status: number) =>
  NextResponse.json({ error: fallback }, { status }),
);
const profileMaybeSingle = vi.fn();
const auditInsert = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
  // As the real helper: a database STEP_UP_REQUIRED becomes the route's step-up answer.
  stepUpResponseForRefusal: async (req: NextRequest, error: { message?: string } | null) => {
    if (!String(error?.message ?? "").includes("STEP_UP_REQUIRED")) return null;
    const assurance = await requireSensitiveActionAuth(req);
    return "response" in assurance ? assurance.response : null;
  },
  createRequestSupabaseClient: (req: NextRequest) => createRequestSupabaseClient(req),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
}));
vi.mock("@/lib/error-handling", () => ({
  apiErrorResponse: (...args: unknown[]) =>
    apiErrorResponse(...(args as [unknown, string, number])),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn() },
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: profileMaybeSingle,
            })),
          })),
        };
      }
      if (table === "audit_log") {
        return { insert: auditInsert };
      }
      throw new Error(`Unexpected table in role-change test: ${table}`);
    },
  }),
}));

const USER_ID = "00000000-0000-0000-0000-000000000001";
const TARGET_ID = "00000000-0000-0000-0000-000000000002";
const ORG_ID = "11111111-1111-1111-1111-111111111111";
const SANDBOX_ID = "22222222-2222-2222-2222-222222222222";
const IDEMPOTENCY = "33333333-3333-3333-3333-333333333333";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.test/api/organizations/role-change", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireSensitiveActionAuth.mockResolvedValue({ user: { id: "caller" } });
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
  requireAuthenticatedUser.mockResolvedValue({ user: { id: USER_ID } });
  checkRateLimit.mockResolvedValue({
    limited: false,
    reset: 0,
    misconfigured: false,
  });
  resolveEffectiveOrgId.mockResolvedValue(ORG_ID);
  createRequestSupabaseClient.mockReturnValue({
    rpc: vi.fn(async () => ({ data: { status: "success" }, error: null })),
  });
  profileMaybeSingle.mockResolvedValue({ data: { email: "target@dubgrid.test" }, error: null });
  auditInsert.mockResolvedValue({ error: null });
});

async function importRoute() {
  return import("./route");
}

describe("POST /api/organizations/role-change", () => {
  // A Gridmaster could make anyone Super Admin anywhere here (41d3, F-16).
  it("changes no role without fresh proof", async () => {
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ code: "STEP_UP_REQUIRED" }), { status: 403 }),
    });
    const rpc = vi.fn();
    createRequestSupabaseClient.mockReturnValue({ rpc });
    const { POST } = await importRoute();

    const response = await POST(
      makeRequest({
        targetUserId: "33333333-3333-4333-8333-333333333333",
        newRole: "super_admin",
        orgId: ORG_ID,
        idempotencyKey: "44444444-4444-4444-8444-444444444444",
      }),
    );

    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("blocks self role-change with 403", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        targetUserId: USER_ID,
        newRole: "admin",
        orgId: ORG_ID,
        idempotencyKey: IDEMPOTENCY,
      }),
    );
    expect(res.status).toBe(403);
    expect(createRequestSupabaseClient).not.toHaveBeenCalled();
  });

  it("redirects orgId through resolveEffectiveOrgId before calling RPC", async () => {
    resolveEffectiveOrgId.mockResolvedValueOnce(SANDBOX_ID);
    const rpc = vi.fn(async () => ({
      data: { status: "success" },
      error: null,
    }));
    createRequestSupabaseClient.mockReturnValueOnce({ rpc });

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        targetUserId: TARGET_ID,
        newRole: "admin",
        orgId: ORG_ID,
        idempotencyKey: IDEMPOTENCY,
      }),
    );

    expect(res.status).toBe(200);
    expect(resolveEffectiveOrgId).toHaveBeenCalledWith(expect.anything(), USER_ID, ORG_ID);
    expect(rpc).toHaveBeenCalledWith(
      "change_user_role",
      expect.objectContaining({
        p_target_user_id: TARGET_ID,
        p_org_id: SANDBOX_ID,
      }),
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: SANDBOX_ID,
        action: "role.changed",
        resource_type: "role",
        resource_id: TARGET_ID,
        details: expect.objectContaining({ targetEmail: "target@dubgrid.test", newRole: "admin" }),
      }),
    );
  });

  it("returns 429 when rate-limited", async () => {
    checkRateLimit.mockResolvedValueOnce({
      limited: true,
      reset: 1000,
      misconfigured: false,
    });
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        targetUserId: TARGET_ID,
        newRole: "admin",
        orgId: ORG_ID,
        idempotencyKey: IDEMPOTENCY,
      }),
    );
    expect(res.status).toBe(429);
    expect(createRequestSupabaseClient).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies with 400", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        targetUserId: "not-a-uuid",
        newRole: "admin",
      }),
    );
    expect(res.status).toBe(400);
    expect(createRequestSupabaseClient).not.toHaveBeenCalled();
  });

  it("maps the RPC self-action error to 403", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "SELF_ACTION_FORBIDDEN: cannot modify yourself" },
    }));
    createRequestSupabaseClient.mockReturnValueOnce({ rpc });

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        targetUserId: TARGET_ID,
        newRole: "admin",
        orgId: ORG_ID,
        idempotencyKey: IDEMPOTENCY,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("blocks invalid CSRF", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        targetUserId: TARGET_ID,
        newRole: "admin",
        orgId: ORG_ID,
        idempotencyKey: IDEMPOTENCY,
      }),
    );
    expect(res.status).toBe(403);
    expect(createRequestSupabaseClient).not.toHaveBeenCalled();
  });
});
