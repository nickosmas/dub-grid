import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const validateCsrfOrigin = vi.fn();
const getServiceClient = vi.fn();

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));

const REAL_ORG = "11111111-1111-1111-1111-111111111111";
const SANDBOX_ORG = "22222222-2222-2222-2222-222222222222";

/** Captures the org id passed to `.eq("org_id", <id>)` on the certifications read. */
function buildServiceClient() {
  const captured: { orgId: string | null } = { orgId: null };
  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  chain.select = passthrough;
  chain.order = passthrough;
  chain.is = passthrough;
  chain.eq = (col: string, val: string) => {
    if (col === "org_id") captured.orgId = val;
    return chain;
  };
  // The query is awaited at the end of the chain.
  chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: [], error: null });
  const client = { from: () => chain };
  return { client, captured };
}

function makeRequest(orgId: string): NextRequest {
  return new NextRequest(
    `https://app.test/api/settings/config?action=fetchCertifications&orgId=${orgId}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
});

describe("GET /api/settings/config", () => {
  it("reads from the effective (sandbox-redirected) org, not the raw query orgId", async () => {
    const { client, captured } = buildServiceClient();
    getServiceClient.mockReturnValue(client);
    // requireOrgPermissions redirects a sandbox caller to their sandbox org.
    requireOrgPermissions.mockResolvedValue({
      actor: { id: "actor-1" },
      serviceClient: client,
      orgId: SANDBOX_ORG,
    });

    const { GET } = await import("./route");
    const res = await GET(makeRequest(REAL_ORG));

    expect(res?.status).toBe(200);
    // The query param was the real org, but the read must hit the sandbox org.
    expect(captured.orgId).toBe(SANDBOX_ORG);
    expect(captured.orgId).not.toBe(REAL_ORG);
  });
});

describe("department authorization", () => {
  function forbid() {
    requireOrgPermissions.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });
  }

  it("lets label viewers read departments but only focus-area managers change them", async () => {
    const { client } = buildServiceClient();
    getServiceClient.mockReturnValue(client);
    forbid();
    const { GET, POST } = await import("./route");

    await GET(
      new NextRequest(
        `https://app.test/api/settings/config?action=fetchDepartments&orgId=${REAL_ORG}`,
      ),
    );
    const canRead = requireOrgPermissions.mock.calls[0][2];
    expect(canRead({ canViewOrgLabels: true })).toBe(true);
    expect(canRead({ canViewFocusAreas: true })).toBe(true);
    expect(canRead({})).toBeFalsy();

    await POST(
      new NextRequest("https://app.test/api/settings/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "saveDepartments",
          orgId: REAL_ORG,
          items: [],
          existing: [],
        }),
      }),
    );
    const canManage = requireOrgPermissions.mock.calls[1][2];
    expect(canManage({ canManageFocusAreas: true })).toBe(true);
    expect(canManage({ isSuperAdmin: true })).toBe(true);
    expect(canManage({ canManageOrgLabels: true })).toBeFalsy();
  });
});
