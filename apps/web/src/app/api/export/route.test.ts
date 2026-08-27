import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const requireOrgPermissions = vi.fn();
const checkRateLimit = vi.fn();
const isFeatureEnabled = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: (...args: unknown[]) => isFeatureEnabled(...args),
}));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

const REQUESTED_ORG_ID = "11111111-1111-4111-8111-111111111111";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";

function makeRequest(orgId: string) {
  const url = new URL("http://localhost/api/export");
  url.searchParams.set("type", "staff");
  url.searchParams.set("orgId", orgId);
  return new NextRequest(url);
}

function createServiceClientMock() {
  const orgIdFilters: string[] = [];
  const auditInsert = vi.fn().mockResolvedValue({ error: null });

  const serviceClient = {
    from(table: string) {
      if (table === "audit_log") {
        return { insert: auditInsert };
      }

      const query = {
        select() {
          return query;
        },
        eq(column: string, value: string) {
          if (column === "org_id") orgIdFilters.push(value);
          return query;
        },
        is() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        then<TResult1 = unknown, TResult2 = never>(
          onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  };

  return { serviceClient, orgIdFilters, auditInsert };
}

describe("GET /api/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUser.mockResolvedValue({
      user: { id: "user-1", email: "staff@example.com" },
    });
    checkRateLimit.mockResolvedValue({ limited: false, reset: null, misconfigured: false });
    isFeatureEnabled.mockResolvedValue(true);
  });

  it("exports and audits the effective sandbox Organization, never the raw query id", async () => {
    const { serviceClient, orgIdFilters, auditInsert } = createServiceClientMock();
    requireOrgPermissions.mockResolvedValue({ orgId: SANDBOX_ORG_ID, serviceClient });

    const { GET } = await import("./route");
    const response = await GET(makeRequest(REQUESTED_ORG_ID));

    expect(response.status).toBe(200);
    expect(orgIdFilters).toContain(SANDBOX_ORG_ID);
    expect(orgIdFilters).not.toContain(REQUESTED_ORG_ID);
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ org_id: SANDBOX_ORG_ID }));
  });
});
