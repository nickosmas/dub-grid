import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedUserWithClaims = vi.fn();
const createRequestSupabaseClient = vi.fn();
const getServiceClient = vi.fn();
const checkRateLimit = vi.fn();
const requireOrgPermissions = vi.fn();
const createSandboxWorkspace = vi.fn();
const deleteSandboxWorkspace = vi.fn();
const findActiveSandboxForUser = vi.fn();
const rowToOrganization = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: (req: NextRequest) => createRequestSupabaseClient(req),
  requireAuthenticatedUserWithClaims: (req: NextRequest) =>
    requireAuthenticatedUserWithClaims(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  testSandboxLimiter: { name: "testSandboxLimiter" },
}));

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));

vi.mock("@/lib/db/mappers", () => ({
  rowToOrganization: (...args: unknown[]) => rowToOrganization(...args),
}));

vi.mock("@/features/test-sandbox/server", () => ({
  createSandboxWorkspace: (...args: unknown[]) => createSandboxWorkspace(...args),
  deleteSandboxWorkspace: (...args: unknown[]) => deleteSandboxWorkspace(...args),
  findActiveSandboxForUser: (...args: unknown[]) =>
    findActiveSandboxForUser(...args),
}));

import { POST } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_ORG_ID = "22222222-2222-4222-8222-222222222222";
const SANDBOX_ORG_ID = "33333333-3333-4333-8333-333333333333";
const NEW_SANDBOX_ORG_ID = "44444444-4444-4444-8444-444444444444";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/test-sandbox", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/test-sandbox", () => {
  let switchRpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: USER_ID, email: "admin@example.com" },
      claims: {
        org_id: SOURCE_ORG_ID,
        org_role: "super_admin",
      },
    });
    switchRpc = vi.fn().mockResolvedValue({ error: null });
    createRequestSupabaseClient.mockReturnValue({ rpc: switchRpc });
    getServiceClient.mockReturnValue({ from: vi.fn() });
    checkRateLimit.mockResolvedValue({ limited: false });
    requireOrgPermissions.mockResolvedValue({
      actor: { id: USER_ID },
      permissions: { isSuperAdmin: true },
    });
    findActiveSandboxForUser.mockResolvedValue(null);
    createSandboxWorkspace.mockResolvedValue({
      org: { id: NEW_SANDBOX_ORG_ID, name: "Test Sandbox" },
      sourceOrgId: SOURCE_ORG_ID,
      employeeCount: 6,
    });
    deleteSandboxWorkspace.mockResolvedValue({ sourceOrgId: SOURCE_ORG_ID });
    rowToOrganization.mockImplementation((row: { id: string; name: string }) => ({
      id: row.id,
      name: row.name,
      workspaceKind: "sandbox",
    }));
  });

  it("creates a test sandbox from the current workspace when none exists", async () => {
    const response = await POST(makeRequest({ action: "create" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      sandbox: {
        sourceOrgId: SOURCE_ORG_ID,
        employeeCount: 6,
      },
    });
    expect(findActiveSandboxForUser).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
    );
    expect(requireOrgPermissions).toHaveBeenCalledWith(
      expect.any(NextRequest),
      SOURCE_ORG_ID,
      expect.any(Function),
      {
        allowDuringSetup: true,
        allowLockedWorkspace: true,
      },
    );
    expect(createSandboxWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ id: USER_ID }),
        sourceOrgId: SOURCE_ORG_ID,
        archiveExistingActive: true,
      }),
    );
  });

  it("reuses the existing sandbox via switch_org when the user already owns one", async () => {
    findActiveSandboxForUser.mockResolvedValueOnce({
      id: SANDBOX_ORG_ID,
      name: "Existing Sandbox",
      workspace_kind: "sandbox",
      sandbox_source_org_id: SOURCE_ORG_ID,
    });

    const response = await POST(makeRequest({ action: "create" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      sandbox: {
        sourceOrgId: SOURCE_ORG_ID,
        reused: true,
      },
    });
    expect(switchRpc).toHaveBeenCalledWith("switch_org", {
      target_org_id: SANDBOX_ORG_ID,
    });
    expect(createSandboxWorkspace).not.toHaveBeenCalled();
  });

  it("exits the sandbox by hard-deleting via deleteSandboxWorkspace", async () => {
    const response = await POST(
      makeRequest({ action: "exit", sandboxOrgId: SANDBOX_ORG_ID }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(deleteSandboxWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ id: USER_ID }),
        sandboxOrgId: SANDBOX_ORG_ID,
      }),
    );
    expect(createSandboxWorkspace).not.toHaveBeenCalled();
  });

  it("returns authorization responses from the source workspace check", async () => {
    requireOrgPermissions.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Insufficient permissions" }, { status: 403 }),
    });

    const response = await POST(makeRequest({ action: "create" }));

    expect(response.status).toBe(403);
    expect(createSandboxWorkspace).not.toHaveBeenCalled();
  });

  it("rate limits test sandbox creation by user in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    checkRateLimit.mockResolvedValueOnce({
      limited: true,
      reset: Date.now() + 30_000,
    });

    try {
      const response = await POST(makeRequest({ action: "create" }));

      expect(response.status).toBe(429);
      await expect(response.json()).resolves.toEqual({
        error: "Too many test sandbox requests",
      });
      expect(createSandboxWorkspace).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns client errors for invalid source workspace choices", async () => {
    createSandboxWorkspace.mockRejectedValueOnce(
      new Error("Choose a real workspace before opening the test sandbox."),
    );

    const response = await POST(makeRequest({ action: "create" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Choose a real workspace before opening the test sandbox.",
    });
  });
});
