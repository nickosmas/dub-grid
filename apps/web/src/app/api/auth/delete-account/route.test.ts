import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUserWithClaims = vi.fn();
const forbidIfSandboxCookie = vi.fn();
const validateCsrfOrigin = vi.fn();
const checkRateLimit = vi.fn();
const getServiceClient = vi.fn();
const canManageProfileChangeRequests = vi.fn();
const extractJwtClaims = vi.fn();
const captureException = vi.fn();
const loggerError = vi.fn();
const loggerInfo = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
  forbidIfSandboxCookie: (req: NextRequest) => forbidIfSandboxCookie(req),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));
vi.mock("@/features/account/server", () => ({
  canManageProfileChangeRequests: (...args: unknown[]) => canManageProfileChangeRequests(...args),
}));
vi.mock("@/features/permissions/shared", () => ({
  extractJwtClaims: (...args: unknown[]) => extractJwtClaims(...args),
}));
vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));
vi.mock("@/lib/logger", () => ({
  default: {
    error: (...args: unknown[]) => loggerError(...args),
    info: (...args: unknown[]) => loggerInfo(...args),
  },
}));

const USER_ID = "00000000-0000-0000-0000-000000000001";
const ORG_ID = "11111111-1111-1111-1111-111111111111";

type ServiceOpts = {
  platformRole?: "user" | "admin" | "super_admin" | "gridmaster" | null;
  memberships?: Array<{ org_id: string; org_role: string }>;
  superAdminCountByOrg?: Record<string, number>;
  cleanupFailures?: Set<string>;
  authDeleteError?: { message: string } | null;
  auditError?: { message: string } | null;
};

function buildServiceClient(opts: ServiceOpts) {
  const memberships = opts.memberships ?? [];
  const counts = opts.superAdminCountByOrg ?? {};
  const cleanup = opts.cleanupFailures ?? new Set<string>();
  const auditInsert = vi.fn(async () => ({ error: opts.auditError ?? null }));
  const authDeleteUser = vi.fn(async () => ({
    error: opts.authDeleteError ?? null,
  }));

  const client = {
    auth: { admin: { deleteUser: authDeleteUser } },
    from: (table: string) => {
      if (table === "profiles") {
        const profileMaybeSingle = vi.fn(async () => ({
          data: { platform_role: opts.platformRole ?? "user" },
          error: null,
        }));
        const deleteEq = vi.fn(async () => ({
          error: cleanup.has("profiles") ? { message: "fail" } : null,
        }));
        const delete_ = vi.fn(() => ({ eq: deleteEq }));
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: profileMaybeSingle })),
          })),
          delete: delete_,
        };
      }
      if (table === "organization_memberships") {
        // .select(...).eq("user_id", X) returns list
        // .select(..., { count: 'exact', head: true }).eq("org_id", X).eq("org_role", "super_admin") returns count
        const listSelect = vi.fn((_cols: string, opts2?: { head?: boolean }) => {
          if (opts2?.head) {
            return {
              eq: vi.fn((_col1: string, orgId: string) => ({
                eq: vi.fn(async () => ({ count: counts[orgId] ?? 0, error: null })),
              })),
            };
          }
          return {
            eq: vi.fn(async () => ({ data: memberships, error: null })),
          };
        });
        const deleteEq = vi.fn(async () => ({
          error: cleanup.has("organization_memberships") ? { message: "fail" } : null,
        }));
        return {
          select: listSelect,
          delete: vi.fn(() => ({ eq: deleteEq })),
        };
      }
      if (table === "employees") {
        const updateEq = vi.fn(async () => ({
          error: cleanup.has("employees") ? { message: "fail" } : null,
        }));
        return { update: vi.fn(() => ({ eq: updateEq })) };
      }
      if (
        table === "notification_preferences" ||
        table === "user_sessions" ||
        table === "cookie_consents" ||
        table === "terms_acceptances"
      ) {
        const deleteEq = vi.fn(async () => ({
          error: cleanup.has(table) ? { message: "fail" } : null,
        }));
        return { delete: vi.fn(() => ({ eq: deleteEq })) };
      }
      if (table === "audit_log") {
        return { insert: auditInsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { client, auditInsert, authDeleteUser };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.test/api/auth/delete-account", {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  forbidIfSandboxCookie.mockReturnValue(null);
  validateCsrfOrigin.mockReturnValue(null);
  checkRateLimit.mockResolvedValue({
    limited: false,
    reset: 0,
    misconfigured: false,
  });
  extractJwtClaims.mockReturnValue({ orgId: ORG_ID });
  canManageProfileChangeRequests.mockResolvedValue(true);
  requireAuthenticatedUserWithClaims.mockResolvedValue({
    user: { id: USER_ID, email: "u@test.com" },
    session: { access_token: "tok" },
  });
});

async function importRoute() {
  return import("./route");
}

describe("DELETE /api/auth/delete-account", () => {
  it("returns 429 when rate-limited", async () => {
    checkRateLimit.mockResolvedValueOnce({
      limited: true,
      reset: 1000,
      misconfigured: false,
    });
    const { client } = buildServiceClient({});
    getServiceClient.mockReturnValue(client);
    const { DELETE } = await importRoute();
    const res = await DELETE(makeRequest({ confirmation: "DELETE MY ACCOUNT" }));
    expect(res.status).toBe(429);
  });

  it("rejects gridmaster accounts", async () => {
    const { client, authDeleteUser } = buildServiceClient({
      platformRole: "gridmaster",
    });
    getServiceClient.mockReturnValue(client);
    const { DELETE } = await importRoute();
    const res = await DELETE(makeRequest({ confirmation: "DELETE MY ACCOUNT" }));
    expect(res.status).toBe(403);
    expect(authDeleteUser).not.toHaveBeenCalled();
  });

  it("rejects when caller is the sole super_admin of an org", async () => {
    const { client, authDeleteUser } = buildServiceClient({
      memberships: [{ org_id: ORG_ID, org_role: "super_admin" }],
      superAdminCountByOrg: { [ORG_ID]: 1 },
    });
    getServiceClient.mockReturnValue(client);
    const { DELETE } = await importRoute();
    const res = await DELETE(makeRequest({ confirmation: "DELETE MY ACCOUNT" }));
    expect(res.status).toBe(409);
    expect(authDeleteUser).not.toHaveBeenCalled();
  });

  it("rejects wrong confirmation text", async () => {
    const { client, authDeleteUser } = buildServiceClient({});
    getServiceClient.mockReturnValue(client);
    const { DELETE } = await importRoute();
    const res = await DELETE(makeRequest({ confirmation: "delete my account" }));
    expect(res.status).toBe(400);
    expect(authDeleteUser).not.toHaveBeenCalled();
  });

  it("aborts WITHOUT calling auth.deleteUser when a cleanup step fails", async () => {
    const { client, authDeleteUser, auditInsert } = buildServiceClient({
      cleanupFailures: new Set(["notification_preferences"]),
    });
    getServiceClient.mockReturnValue(client);
    const { DELETE } = await importRoute();
    const res = await DELETE(makeRequest({ confirmation: "DELETE MY ACCOUNT" }));
    expect(res.status).toBe(500);
    expect(authDeleteUser).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalled();
  });

  it("returns 500 without writing audit when auth.deleteUser fails after cleanup", async () => {
    const { client, authDeleteUser, auditInsert } = buildServiceClient({
      authDeleteError: { message: "auth-down" },
    });
    getServiceClient.mockReturnValue(client);
    const { DELETE } = await importRoute();
    const res = await DELETE(makeRequest({ confirmation: "DELETE MY ACCOUNT" }));
    expect(res.status).toBe(500);
    expect(authDeleteUser).toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: "auth-delete-after-cleanup",
        }),
      }),
    );
  });

  it("happy path: cleanup, auth delete, audit, returns binary success", async () => {
    const { client, authDeleteUser, auditInsert } = buildServiceClient({});
    getServiceClient.mockReturnValue(client);
    const { DELETE } = await importRoute();
    const res = await DELETE(makeRequest({ confirmation: "DELETE MY ACCOUNT" }));
    expect(res.status).toBe(200);
    expect(authDeleteUser).toHaveBeenCalledWith(USER_ID);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.deleted" }),
    );
    const audited = (auditInsert.mock.calls[0] as unknown[])[0] as {
      details: Record<string, unknown>;
    };
    // cleanupFailures should no longer be part of the audit details
    expect(audited.details).not.toHaveProperty("cleanupFailures");
    await expect(res.json()).resolves.toEqual({ success: true });
  });
});
