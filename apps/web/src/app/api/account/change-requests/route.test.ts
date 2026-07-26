import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const validateCsrfOrigin = vi.fn();
const getServiceClient = vi.fn();
const listOwnProfileChangeRequests = vi.fn();
const createProfileChangeRequest = vi.fn();
const resolveEffectiveOrgId = vi.fn();
const apiErrorResponse = vi.fn((_err: unknown, fallback: string, status: number) =>
  NextResponse.json({ error: fallback }, { status }),
);

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
}));
vi.mock("@/lib/error-handling", () => ({
  apiErrorResponse: (...args: unknown[]) =>
    apiErrorResponse(...(args as [unknown, string, number])),
}));
vi.mock("@/features/account/server", () => ({
  listOwnProfileChangeRequests: (...args: unknown[]) => listOwnProfileChangeRequests(...args),
  createProfileChangeRequest: (...args: unknown[]) => createProfileChangeRequest(...args),
  createProfileChangeRequestSchema: {
    safeParse: (input: unknown) => {
      // Minimal stub: accept objects with the expected shape, reject others.
      const data = input as Record<string, unknown> | null;
      if (
        data &&
        typeof data.orgId === "string" &&
        typeof data.type === "string" &&
        typeof data.requestedChanges === "object"
      ) {
        return {
          success: true,
          data: {
            orgId: data.orgId,
            type: data.type,
            requestedChanges: data.requestedChanges,
            requestNote: data.requestNote,
          },
        };
      }
      return { success: false };
    },
  },
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";

type MembershipRow = { user_id: string } | null;

function buildServiceClient(membership: MembershipRow) {
  const maybeSingle = vi.fn(async () => ({ data: membership, error: null }));
  const eqOrg = vi.fn(() => ({ maybeSingle }));
  const eqUser = vi.fn(() => ({ eq: eqOrg }));
  const select = vi.fn(() => ({ eq: eqUser }));
  const from = vi.fn((table: string) => {
    if (table === "organization_memberships") return { select };
    throw new Error(`Unexpected table: ${table}`);
  });
  return { from, maybeSingle, eqOrg, eqUser };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUser.mockResolvedValue({
    user: { id: "user-1", email: "u@test.com" },
  });
  validateCsrfOrigin.mockReturnValue(null);
  listOwnProfileChangeRequests.mockResolvedValue([]);
  createProfileChangeRequest.mockResolvedValue({ id: "req-1" });
  // Default: no sandbox cookie, effective org == requested org.
  resolveEffectiveOrgId.mockImplementation((_req, _userId, orgId) => Promise.resolve(orgId));
});

describe("GET /api/account/change-requests", () => {
  it("returns 400 when orgId is missing", async () => {
    const res = await GET(new NextRequest("http://localhost/api/account/change-requests"));
    expect(res.status).toBe(400);
    expect(listOwnProfileChangeRequests).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not a member of orgId", async () => {
    getServiceClient.mockReturnValue(buildServiceClient(null));
    const res = await GET(
      new NextRequest(`http://localhost/api/account/change-requests?orgId=${ORG_ID}`),
    );
    expect(res.status).toBe(403);
    expect(listOwnProfileChangeRequests).not.toHaveBeenCalled();
  });

  it("returns requests when caller is a member of orgId", async () => {
    const sc = buildServiceClient({ user_id: "user-1" });
    getServiceClient.mockReturnValue(sc);
    listOwnProfileChangeRequests.mockResolvedValueOnce([{ id: "req-1", type: "name" }]);
    const res = await GET(
      new NextRequest(`http://localhost/api/account/change-requests?orgId=${ORG_ID}`),
    );
    expect(res.status).toBe(200);
    expect(listOwnProfileChangeRequests).toHaveBeenCalledWith({
      serviceClient: sc,
      userId: "user-1",
      orgId: ORG_ID,
    });
    await expect(res.json()).resolves.toEqual({
      requests: [{ id: "req-1", type: "name" }],
    });
  });

  it("rejects unauthenticated reads", async () => {
    requireAuthenticatedUser.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });
    const res = await GET(
      new NextRequest(`http://localhost/api/account/change-requests?orgId=${ORG_ID}`),
    );
    expect(res.status).toBe(401);
    expect(getServiceClient).not.toHaveBeenCalled();
  });

  it("lists requests for the effective (sandbox-redirected) org, not the raw query org id", async () => {
    resolveEffectiveOrgId.mockResolvedValue(SANDBOX_ORG_ID);
    const sc = buildServiceClient({ user_id: "user-1" });
    getServiceClient.mockReturnValue(sc);

    const res = await GET(
      new NextRequest(`http://localhost/api/account/change-requests?orgId=${ORG_ID}`),
    );

    expect(res.status).toBe(200);
    expect(resolveEffectiveOrgId).toHaveBeenCalledWith(expect.anything(), "user-1", ORG_ID);
    // The membership check and the listing must both use the effective org.
    expect(sc.eqOrg).toHaveBeenCalledWith("org_id", SANDBOX_ORG_ID);
    expect(listOwnProfileChangeRequests).toHaveBeenCalledWith({
      serviceClient: sc,
      userId: "user-1",
      orgId: SANDBOX_ORG_ID,
    });
  });
});

describe("POST /api/account/change-requests", () => {
  function postBody(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/account/change-requests", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  it("rejects invalid bodies with 400", async () => {
    const res = await POST(postBody({ orgId: 123 }));
    expect(res.status).toBe(400);
    expect(createProfileChangeRequest).not.toHaveBeenCalled();
  });

  it("creates a request on the happy path", async () => {
    createProfileChangeRequest.mockResolvedValueOnce({
      id: "req-2",
      type: "name",
    });
    const res = await POST(
      postBody({
        orgId: ORG_ID,
        type: "name",
        requestedChanges: { firstName: "Jane" },
        requestNote: "please",
      }),
    );
    expect(res.status).toBe(201);
    expect(createProfileChangeRequest).toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      request: { id: "req-2", type: "name" },
    });
  });

  it("blocks invalid CSRF origins", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(
      postBody({
        orgId: ORG_ID,
        type: "name",
        requestedChanges: { firstName: "Jane" },
      }),
    );
    expect(res.status).toBe(403);
    expect(createProfileChangeRequest).not.toHaveBeenCalled();
  });

  it("creates the request against the effective (sandbox-redirected) org, not the raw body org id", async () => {
    resolveEffectiveOrgId.mockResolvedValue(SANDBOX_ORG_ID);
    createProfileChangeRequest.mockResolvedValueOnce({ id: "req-3", type: "name" });

    const res = await POST(
      postBody({
        orgId: ORG_ID,
        type: "name",
        requestedChanges: { firstName: "Jane" },
      }),
    );

    expect(res.status).toBe(201);
    expect(resolveEffectiveOrgId).toHaveBeenCalledWith(expect.anything(), "user-1", ORG_ID);
    expect(createProfileChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: SANDBOX_ORG_ID }),
    );
  });
});
