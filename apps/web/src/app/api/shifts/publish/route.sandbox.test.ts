import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const requireOrgPermissions = vi.fn();
const fetchScheduleDraftBreakdown = vi.fn();
const publishScheduleDirect = vi.fn();
const fetchPendingNotePublishChanges = vi.fn();
const recordNotePublishChanges = vi.fn();

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
  publishScheduleDirect: (...args: unknown[]) => publishScheduleDirect(...args),
  fetchPendingNotePublishChanges: (...args: unknown[]) => fetchPendingNotePublishChanges(...args),
  recordNotePublishChanges: (...args: unknown[]) => recordNotePublishChanges(...args),
}));

import { POST } from "./route";

const REQUESTED_ORG_ID = "11111111-1111-4111-8111-111111111111";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";

describe("POST /api/shifts/publish inside a Test Sandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUser.mockResolvedValue({ user: { id: "user-1", email: "a@example.com" } });
    fetchScheduleDraftBreakdown.mockResolvedValue({ totalChanges: 1 });
    fetchPendingNotePublishChanges.mockResolvedValue([]);
    publishScheduleDirect.mockResolvedValue("publish-1");
  });

  it("publishes, records notes and writes the audit row against the effective organization", async () => {
    const auditInsert = vi.fn().mockResolvedValue({ error: null });
    requireOrgPermissions.mockResolvedValue({
      orgId: SANDBOX_ORG_ID,
      serviceClient: { from: () => ({ insert: auditInsert }) },
      actor: { id: "user-1" },
      permissions: { canPublishSchedule: true },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/shifts/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgId: REQUESTED_ORG_ID,
          startDate: "2026-04-12",
          endDate: "2026-04-18",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(requireOrgPermissions).toHaveBeenCalledWith(
      expect.anything(),
      REQUESTED_ORG_ID,
      expect.any(Function),
      expect.anything(),
    );
    for (const call of [
      fetchScheduleDraftBreakdown,
      fetchPendingNotePublishChanges,
      publishScheduleDirect,
    ]) {
      expect(call).toHaveBeenCalledWith(expect.objectContaining({ orgId: SANDBOX_ORG_ID }));
      expect(call).not.toHaveBeenCalledWith(expect.objectContaining({ orgId: REQUESTED_ORG_ID }));
    }
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ org_id: SANDBOX_ORG_ID, resource_id: SANDBOX_ORG_ID }),
    );
  });
});
