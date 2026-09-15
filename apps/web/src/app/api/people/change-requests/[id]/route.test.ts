import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireOrgPermissions = vi.fn();
const resolveProfileChangeRequest = vi.fn();
const fetchProfileChangeRequestForResolution = vi.fn();
const requireSensitiveActionAuth = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/lib/api-auth", () => ({
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/features/account/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/account/server")>(
    "@/features/account/server",
  );
  return {
    ...actual,
    fetchProfileChangeRequestForResolution: (...args: unknown[]) =>
      fetchProfileChangeRequestForResolution(...args),
    resolveProfileChangeRequest: (...args: unknown[]) => resolveProfileChangeRequest(...args),
  };
});

const REQUESTED_ORG_ID = "11111111-1111-4111-8111-111111111111";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";
const SERVICE_CLIENT = { marker: "service-client" };
const ACTOR = { id: "22222222-2222-4222-8222-222222222222" };
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";

function makeRequest(orgId: string, action: "approve" | "reject" = "approve") {
  const url = new URL(`http://localhost/api/people/change-requests/${REQUEST_ID}`);
  url.searchParams.set("orgId", orgId);
  return new NextRequest(url, {
    method: "PATCH",
    body: JSON.stringify({ action }),
  });
}

describe("PATCH /api/people/change-requests/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    fetchProfileChangeRequestForResolution.mockResolvedValue({
      id: REQUEST_ID,
      orgId: SANDBOX_ORG_ID,
      type: "profile_update",
      status: "pending",
    });
    requireSensitiveActionAuth.mockResolvedValue({
      user: ACTOR,
      session: { access_token: "fresh-token" },
      claims: { org_id: SANDBOX_ORG_ID },
    });
    resolveProfileChangeRequest.mockResolvedValue({ id: REQUEST_ID, status: "approved" });
  });

  it("resolves a change request against the effective org, not the raw query param (M-1)", async () => {
    // Caller's query string carries the REAL org, but a sandbox cookie is
    // active, so requireOrgPermissions redirects to the sandbox org. This
    // matters most for account_deletion requests — never delete a real
    // account from a sandbox context.
    requireOrgPermissions.mockResolvedValue({
      orgId: SANDBOX_ORG_ID,
      serviceClient: SERVICE_CLIENT,
      actor: ACTOR,
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest(REQUESTED_ORG_ID), {
      params: Promise.resolve({ id: REQUEST_ID }),
    });

    expect(res.status).toBe(200);
    expect(requireOrgPermissions).toHaveBeenCalledWith(
      expect.anything(),
      REQUESTED_ORG_ID,
      expect.any(Function),
    );
    expect(resolveProfileChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: SANDBOX_ORG_ID,
        serviceClient: SERVICE_CLIENT,
        actor: ACTOR,
        requestId: REQUEST_ID,
        request: expect.objectContaining({ type: "profile_update" }),
      }),
    );
    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
  });

  it("requires step-up only before approving an account-deletion request", async () => {
    fetchProfileChangeRequestForResolution.mockResolvedValueOnce({
      id: REQUEST_ID,
      orgId: SANDBOX_ORG_ID,
      type: "account_deletion",
      status: "pending",
    });
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ code: "STEP_UP_REQUIRED", method: "totp" }), {
        status: 403,
      }),
    });
    requireOrgPermissions.mockResolvedValue({
      orgId: SANDBOX_ORG_ID,
      serviceClient: SERVICE_CLIENT,
      actor: ACTOR,
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest(REQUESTED_ORG_ID), {
      params: Promise.resolve({ id: REQUEST_ID }),
    });

    expect(res.status).toBe(403);
    expect(resolveProfileChangeRequest).not.toHaveBeenCalled();
  });

  it("does not require step-up when rejecting an account-deletion request", async () => {
    const pendingRequest = {
      id: REQUEST_ID,
      orgId: SANDBOX_ORG_ID,
      type: "account_deletion",
      status: "pending",
    };
    fetchProfileChangeRequestForResolution.mockResolvedValueOnce(pendingRequest);
    requireOrgPermissions.mockResolvedValue({
      orgId: SANDBOX_ORG_ID,
      serviceClient: SERVICE_CLIENT,
      actor: ACTOR,
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(makeRequest(REQUESTED_ORG_ID, "reject"), {
      params: Promise.resolve({ id: REQUEST_ID }),
    });

    expect(res.status).toBe(200);
    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
    expect(resolveProfileChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reject", request: pendingRequest }),
    );
  });
});
