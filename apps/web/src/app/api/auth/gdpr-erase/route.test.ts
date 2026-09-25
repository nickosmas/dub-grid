import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const forbidIfSandboxCookie = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const getServiceClient = vi.fn();
const canManageProfileChangeRequests = vi.fn();
const canDeleteAccountDirectly = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  forbidIfSandboxCookie: (req: NextRequest) => forbidIfSandboxCookie(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));
vi.mock("@/features/account/server", () => ({
  canManageProfileChangeRequests: (...args: unknown[]) => canManageProfileChangeRequests(...args),
  canDeleteAccountDirectly: (...args: unknown[]) => canDeleteAccountDirectly(...args),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
const scheduleAccountDeletedNotice = vi.fn();
vi.mock("@/features/account/server/account-deleted-notice", () => ({
  scheduleAccountDeletedNotice: (...args: unknown[]) => scheduleAccountDeletedNotice(...args),
}));
const rejectDeletedAccountTokens = vi.fn();
vi.mock("@/features/account/server/account-deletion", () => ({
  rejectDeletedAccountTokens: (...args: unknown[]) => rejectDeletedAccountTokens(...args),
}));

describe("POST /api/auth/gdpr-erase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    forbidIfSandboxCookie.mockReturnValue(null);
  });

  it("returns STEP_UP_REQUIRED before reading or erasing personal data", async () => {
    requireSensitiveActionAuth.mockResolvedValue({
      response: NextResponse.json(
        { error: "Confirm your identity.", code: "STEP_UP_REQUIRED", method: "totp" },
        { status: 403 },
      ),
    });

    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("https://app.test/api/auth/gdpr-erase", {
        method: "POST",
        body: JSON.stringify({ confirmation: "ERASE MY DATA" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "STEP_UP_REQUIRED" });
    expect(getServiceClient).not.toHaveBeenCalled();
    expect(canManageProfileChangeRequests).not.toHaveBeenCalled();
  });

  describe("resuming an erasure", () => {
    const USER_ID = "00000000-0000-0000-0000-000000000001";

    function buildClient(opts: { erasureStarted: boolean; authDeleteError?: unknown }) {
      const auditInsert = vi.fn(async () => ({ error: null }));
      const rpc = vi.fn(async () => ({ data: { status: "erased" }, error: null }));
      const deleteUser = vi.fn(async () => ({ error: opts.authDeleteError ?? null }));
      const client = {
        rpc,
        auth: { admin: { deleteUser } },
        from: (table: string) => {
          if (table === "profiles") {
            return {
              select: () => ({
                eq: () => ({ single: async () => ({ data: null, error: null }) }),
              }),
            };
          }
          if (table === "organization_memberships") {
            return { select: () => ({ eq: () => ({ is: async () => ({ data: [] }) }) }) };
          }
          if (table === "audit_log") {
            const limit = async () => ({
              data: opts.erasureStarted ? [{ id: 7 }] : [],
              error: null,
            });
            return {
              insert: auditInsert,
              select: () => ({
                eq: () => ({ eq: () => ({ eq: () => ({ gte: () => ({ limit }) }) }) }),
              }),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      };
      return { client, auditInsert, rpc, deleteUser };
    }

    function erase() {
      return new NextRequest("https://app.test/api/auth/gdpr-erase", {
        method: "POST",
        body: JSON.stringify({ confirmation: "ERASE MY DATA" }),
      });
    }

    beforeEach(() => {
      requireSensitiveActionAuth.mockResolvedValue({
        user: { id: USER_ID, email: "u@test.com" },
        claims: { org_id: "11111111-1111-1111-1111-111111111111" },
      });
    });

    it("records that the erasure began before erasing anything", async () => {
      canDeleteAccountDirectly.mockResolvedValue(true);
      const { client, auditInsert, rpc } = buildClient({ erasureStarted: false });
      getServiceClient.mockReturnValue(client);

      const { POST } = await import("./route");
      const response = await POST(erase());

      expect(response.status).toBe(200);
      expect(auditInsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ action: "gdpr.erasure_started", resource_id: USER_ID }),
      );
      expect(auditInsert.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
    });

    // The first attempt erased the membership that granted the permission,
    // then the Auth deletion failed. The retry used to be refused forever.
    it("lets the same user finish an erasure they began after the membership is gone", async () => {
      canDeleteAccountDirectly.mockResolvedValue(false);
      const { client, deleteUser } = buildClient({ erasureStarted: true });
      getServiceClient.mockReturnValue(client);

      const { POST } = await import("./route");
      const response = await POST(erase());

      expect(response.status).toBe(200);
      expect(deleteUser).toHaveBeenCalledWith(USER_ID);
      expect(rejectDeletedAccountTokens).toHaveBeenCalledWith(
        USER_ID,
        "gdpr-erase-token-revocation",
      );
      expect(scheduleAccountDeletedNotice).toHaveBeenCalledExactlyOnceWith("u@test.com");
    });

    it("leaves the tokens alone when the account itself could not be deleted", async () => {
      canDeleteAccountDirectly.mockResolvedValue(true);
      const { client } = buildClient({
        erasureStarted: false,
        authDeleteError: { message: "auth-down" },
      });
      getServiceClient.mockReturnValue(client);

      const { POST } = await import("./route");
      const response = await POST(erase());

      expect(response.status).toBe(500);
      expect(rejectDeletedAccountTokens).not.toHaveBeenCalled();
      expect(scheduleAccountDeletedNotice).not.toHaveBeenCalled();
    });

    it("still refuses someone without permission who never began an erasure", async () => {
      canDeleteAccountDirectly.mockResolvedValue(false);
      const { client, rpc } = buildClient({ erasureStarted: false });
      getServiceClient.mockReturnValue(client);

      const { POST } = await import("./route");
      const response = await POST(erase());

      expect(response.status).toBe(403);
      expect(rpc).not.toHaveBeenCalled();
    });
  });
});
