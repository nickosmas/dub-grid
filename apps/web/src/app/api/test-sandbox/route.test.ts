import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedUserWithClaims = vi.fn();
const createRequestSupabaseClient = vi.fn();
const getServiceClient = vi.fn();
const checkRateLimit = vi.fn();
const requireOrgPermissions = vi.fn();
const resolveSandboxWorkspaceReset = vi.fn();
const createSandboxWorkspace = vi.fn();
const archiveSandboxWorkspace = vi.fn();

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

vi.mock("@/features/test-sandbox/server", () => ({
  archiveSandboxWorkspace: (...args: unknown[]) => archiveSandboxWorkspace(...args),
  createSandboxWorkspace: (...args: unknown[]) => createSandboxWorkspace(...args),
  resolveSandboxWorkspaceReset: (...args: unknown[]) =>
    resolveSandboxWorkspaceReset(...args),
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
    createRequestSupabaseClient.mockReturnValue({ rpc: vi.fn() });
    getServiceClient.mockReturnValue({ from: vi.fn() });
    checkRateLimit.mockResolvedValue({ limited: false });
    requireOrgPermissions.mockResolvedValue({
      actor: { id: USER_ID },
      permissions: { isSuperAdmin: true },
    });
    resolveSandboxWorkspaceReset.mockResolvedValue({ sourceOrgId: SOURCE_ORG_ID });
    createSandboxWorkspace.mockResolvedValue({
      org: { id: NEW_SANDBOX_ORG_ID, name: "Test Sandbox" },
      sourceOrgId: SOURCE_ORG_ID,
      employeeCount: 6,
    });
    archiveSandboxWorkspace.mockResolvedValue({ sourceOrgId: SOURCE_ORG_ID });
  });

  it("creates a test sandbox from the current workspace with setup and lock bypasses", async () => {
    const response = await POST(makeRequest({ action: "create" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      sandbox: {
        sourceOrgId: SOURCE_ORG_ID,
        employeeCount: 6,
      },
    });
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

  it("creates a replacement sandbox before archiving the old sandbox on reset", async () => {
    const events: string[] = [];
    createSandboxWorkspace.mockImplementation(async () => {
      events.push("create");
      return {
        org: { id: NEW_SANDBOX_ORG_ID, name: "Test Sandbox" },
        sourceOrgId: SOURCE_ORG_ID,
        employeeCount: 6,
      };
    });
    archiveSandboxWorkspace.mockImplementation(async () => {
      events.push("archive");
      return { sourceOrgId: SOURCE_ORG_ID };
    });

    const response = await POST(
      makeRequest({ action: "reset", sandboxOrgId: SANDBOX_ORG_ID }),
    );

    expect(response.status).toBe(200);
    expect(resolveSandboxWorkspaceReset).toHaveBeenCalledWith({
      serviceClient: expect.anything(),
      actor: expect.objectContaining({ id: USER_ID }),
      sandboxOrgId: SANDBOX_ORG_ID,
    });
    expect(createSandboxWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        archiveExistingActive: false,
      }),
    );
    expect(events).toEqual(["create", "archive"]);
  });

  it("does not archive the old sandbox if replacement creation fails", async () => {
    createSandboxWorkspace.mockRejectedValueOnce(new Error("Seed failed"));

    const response = await POST(
      makeRequest({ action: "reset", sandboxOrgId: SANDBOX_ORG_ID }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Seed failed" });
    expect(archiveSandboxWorkspace).not.toHaveBeenCalled();
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
