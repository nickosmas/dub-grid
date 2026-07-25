import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireOrgPermissions = vi.fn();
const resolveProfileChangeRequest = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/features/account/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/account/server")>(
    "@/features/account/server",
  );
  return {
    ...actual,
    resolveProfileChangeRequest: (...args: unknown[]) => resolveProfileChangeRequest(...args),
  };
});

const REQUESTED_ORG_ID = "11111111-1111-4111-8111-111111111111";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";
const SERVICE_CLIENT = { marker: "service-client" };
const ACTOR = { id: "22222222-2222-4222-8222-222222222222" };
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";

function makeRequest(orgId: string) {
  const url = new URL(`http://localhost/api/people/change-requests/${REQUEST_ID}`);
  url.searchParams.set("orgId", orgId);
  return new NextRequest(url, {
    method: "PATCH",
    body: JSON.stringify({ action: "approve" }),
  });
}

describe("PATCH /api/people/change-requests/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    resolveProfileChangeRequest.mockResolvedValue({ id: REQUEST_ID, status: "approved" });
  });

  it("resolves a change request (including account-deletion requests) against the effective org, not the raw query param (M-1)", async () => {
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
      }),
    );
  });
});
