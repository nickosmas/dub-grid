import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const listAdminProfileChangeRequests = vi.fn();

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/features/account/server", () => ({
  listAdminProfileChangeRequests: (...args: unknown[]) => listAdminProfileChangeRequests(...args),
}));

const REQUESTED_ORG_ID = "11111111-1111-4111-8111-111111111111";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";
const SERVICE_CLIENT = { marker: "service-client" };

function makeRequest(orgId: string, status?: string) {
  const url = new URL("http://localhost/api/people/change-requests");
  url.searchParams.set("orgId", orgId);
  if (status) url.searchParams.set("status", status);
  return new NextRequest(url);
}

describe("GET /api/people/change-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAdminProfileChangeRequests.mockResolvedValue([]);
  });

  it("lists requests for the effective (sandbox-redirected) org, not the raw query org id (M-1)", async () => {
    // Caller's query string carries the REAL org, but a sandbox cookie is
    // active, so requireOrgPermissions redirects to the sandbox org.
    requireOrgPermissions.mockResolvedValue({
      orgId: SANDBOX_ORG_ID,
      serviceClient: SERVICE_CLIENT,
    });

    const { GET } = await import("./route");
    const res = await GET(makeRequest(REQUESTED_ORG_ID));

    expect(res.status).toBe(200);
    expect(requireOrgPermissions).toHaveBeenCalledWith(
      expect.anything(),
      REQUESTED_ORG_ID,
      expect.any(Function),
    );
    expect(listAdminProfileChangeRequests).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: SANDBOX_ORG_ID, serviceClient: SERVICE_CLIENT }),
    );
  });

  it("rejects an invalid status filter before hitting the effective org", async () => {
    requireOrgPermissions.mockResolvedValue({
      orgId: SANDBOX_ORG_ID,
      serviceClient: SERVICE_CLIENT,
    });

    const { GET } = await import("./route");
    const res = await GET(makeRequest(REQUESTED_ORG_ID, "bogus-status"));

    expect(res.status).toBe(400);
    expect(listAdminProfileChangeRequests).not.toHaveBeenCalled();
  });
});
