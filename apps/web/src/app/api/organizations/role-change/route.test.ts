import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedUser = vi.fn();
const checkRateLimit = vi.fn();
const resolveEffectiveOrgId = vi.fn();
const createRequestSupabaseClient = vi.fn();
const apiErrorResponse = vi.fn((_err: unknown, fallback: string, status: number) =>
  NextResponse.json({ error: fallback }, { status }),
);

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
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
});

async function importRoute() {
  return import("./route");
}

describe("POST /api/organizations/role-change", () => {
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
