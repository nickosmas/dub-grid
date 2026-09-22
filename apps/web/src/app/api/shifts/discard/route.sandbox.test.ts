import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const requireOrgPermissions = vi.fn();
const fetchScheduleDraftBreakdown = vi.fn();
const discardScheduleDraftsDirect = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: () => null }));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: async () => ({ limited: false, reset: null, misconfigured: false }),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/server/schedule-draft-safety", () => ({
  fetchScheduleDraftBreakdown: (...args: unknown[]) => fetchScheduleDraftBreakdown(...args),
  discardScheduleDraftsDirect: (...args: unknown[]) => discardScheduleDraftsDirect(...args),
}));

import { POST } from "./route";

const REQUESTED_ORG_ID = "11111111-1111-4111-8111-111111111111";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";

describe("POST /api/shifts/discard inside a Test Sandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUser.mockResolvedValue({ user: { id: "user-1", email: "a@example.com" } });
    fetchScheduleDraftBreakdown.mockResolvedValue({ totalChanges: 1 });
    discardScheduleDraftsDirect.mockResolvedValue(undefined);
  });

  it("discards drafts and writes the audit row against the effective organization", async () => {
    const auditInsert = vi.fn().mockResolvedValue({ error: null });
    requireOrgPermissions.mockResolvedValue({
      orgId: SANDBOX_ORG_ID,
      serviceClient: { from: () => ({ insert: auditInsert }) },
      actor: { id: "user-1" },
      permissions: { canEditShifts: true },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/shifts/discard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId: REQUESTED_ORG_ID, scope: "mine" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(requireOrgPermissions).toHaveBeenCalledWith(
      expect.anything(),
      REQUESTED_ORG_ID,
      expect.any(Function),
      expect.anything(),
    );
    expect(fetchScheduleDraftBreakdown).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: SANDBOX_ORG_ID }),
    );
    expect(discardScheduleDraftsDirect).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: SANDBOX_ORG_ID, userId: "user-1" }),
    );
    expect(discardScheduleDraftsDirect).not.toHaveBeenCalledWith(
      expect.objectContaining({ orgId: REQUESTED_ORG_ID }),
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ org_id: SANDBOX_ORG_ID, resource_id: SANDBOX_ORG_ID }),
    );
  });
});
