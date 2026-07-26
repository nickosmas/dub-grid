import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUserWithClaims = vi.fn();
const validateCsrfOrigin = vi.fn();
const canManageProfileChangeRequests = vi.fn();
const updateSelfProfileDetails = vi.fn();
const resolveEffectiveOrgId = vi.fn();
const getServiceClient = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/features/account/server", () => ({
  canManageProfileChangeRequests: (...args: unknown[]) => canManageProfileChangeRequests(...args),
  updateSelfProfileDetails: (...args: unknown[]) => updateSelfProfileDetails(...args),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));

import { PATCH } from "./route";

const USER_ID = "user-1";
const ORG_ID = "11111111-1111-1111-1111-111111111111";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";

function patch(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/account/profile", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function makeAuth(opts?: { orgId?: string | null; orgRole?: string; platformRole?: string }) {
  return {
    user: { id: USER_ID },
    claims: {
      sub: USER_ID,
      platform_role: opts?.platformRole ?? "none",
      org_id: opts?.orgId ?? null,
      org_role: opts?.orgRole,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
  getServiceClient.mockReturnValue({ marker: "service-client" });
  requireAuthenticatedUserWithClaims.mockResolvedValue(
    makeAuth({ orgId: ORG_ID, orgRole: "admin" }),
  );
  resolveEffectiveOrgId.mockImplementation((_req, _userId, orgId) => Promise.resolve(orgId));
  canManageProfileChangeRequests.mockResolvedValue(true);
  updateSelfProfileDetails.mockResolvedValue({ firstName: "Jane", lastName: "Doe" });
});

describe("PATCH /api/account/profile", () => {
  it("edits directly for a caller who can manage change requests", async () => {
    const res = await patchAndCall({ firstName: "Jane", lastName: "Doe", orgId: ORG_ID });

    expect(res.status).toBe(200);
    expect(updateSelfProfileDetails).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_ID }),
    );
  });

  it("blocks a caller who cannot manage change requests, asking them to submit one instead", async () => {
    canManageProfileChangeRequests.mockResolvedValue(false);

    const res = await patchAndCall({ firstName: "Jane", lastName: "Doe", orgId: ORG_ID });

    expect(res.status).toBe(403);
    expect(updateSelfProfileDetails).not.toHaveBeenCalled();
  });

  it("edits directly for a gridmaster regardless of canManageProfileChangeRequests", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(
      makeAuth({ orgId: ORG_ID, platformRole: "gridmaster" }),
    );
    canManageProfileChangeRequests.mockResolvedValue(false);

    const res = await patchAndCall({ firstName: "Jane", lastName: "Doe", orgId: ORG_ID });

    expect(res.status).toBe(200);
    expect(updateSelfProfileDetails).toHaveBeenCalled();
  });

  it("falls back to claims.org_id (already sandbox-rewritten) when the body carries no orgId", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(
      makeAuth({ orgId: SANDBOX_ORG_ID, orgRole: "super_admin" }),
    );

    const res = await patchAndCall({ firstName: "Jane", lastName: "Doe", orgId: null });

    expect(res.status).toBe(200);
    expect(resolveEffectiveOrgId).toHaveBeenCalledWith(expect.anything(), USER_ID, SANDBOX_ORG_ID);
    expect(updateSelfProfileDetails).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: SANDBOX_ORG_ID }),
    );
  });

  it("edits against the effective (sandbox-redirected) org, not the raw body org id", async () => {
    resolveEffectiveOrgId.mockResolvedValue(SANDBOX_ORG_ID);

    const res = await patchAndCall({ firstName: "Jane", lastName: "Doe", orgId: ORG_ID });

    expect(res.status).toBe(200);
    expect(resolveEffectiveOrgId).toHaveBeenCalledWith(expect.anything(), USER_ID, ORG_ID);
    expect(canManageProfileChangeRequests).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: SANDBOX_ORG_ID }),
    );
    expect(updateSelfProfileDetails).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: SANDBOX_ORG_ID }),
    );
  });

  it("blocks invalid CSRF origins", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const res = await patchAndCall({ firstName: "Jane", lastName: "Doe", orgId: ORG_ID });

    expect(res.status).toBe(403);
    expect(updateSelfProfileDetails).not.toHaveBeenCalled();
  });
});

async function patchAndCall(body: unknown) {
  return PATCH(patch(body));
}
