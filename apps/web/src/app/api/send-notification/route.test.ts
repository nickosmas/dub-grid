import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedUserWithClaims = vi.fn();
const resolveEffectiveOrgId = vi.fn();
const checkRateLimit = vi.fn();
const dispatchNotificationEvent = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) =>
    requireAuthenticatedUserWithClaims(req),
}));

vi.mock("@/app/api/shared/permissions", () => ({
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("@/features/notifications/server", () => ({
  dispatchNotificationEvent: (...args: unknown[]) =>
    dispatchNotificationEvent(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/send-notification", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// The route gates on org isolation (the caller's JWT org_id must match the body
// orgId) after auth + rate limiting, then dispatches the event. Per-action
// permission checks live in the notification pipeline, not this route.
describe("POST /api/send-notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: "actor-user", email: "actor@example.com" },
      session: { access_token: "test-token" },
      claims: { sub: "actor-user", org_id: ORG_ID },
    });
    checkRateLimit.mockResolvedValue({
      limited: false,
      reset: null,
      misconfigured: false,
    });
    resolveEffectiveOrgId.mockImplementation(
      async (_req: NextRequest, _userId: string, orgId: string) => orgId,
    );
    // Default: dispatcher succeeds. dispatchNotificationEvent now returns a
    // discriminated result so the route can propagate pipeline failures.
    dispatchNotificationEvent.mockResolvedValue({ success: true });
  });

  it("dispatches the event when the caller's org matches the body org", async () => {
    const response = await POST(
      makeRequest({
        action: "shift_request_resolved",
        orgId: ORG_ID,
        requestId: REQUEST_ID,
        requestType: "swap",
        approved: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(dispatchNotificationEvent).toHaveBeenCalledWith(
      "actor-user",
      expect.objectContaining({
        action: "shift_request_resolved",
        orgId: ORG_ID,
      }),
    );
  });

  it("rejects when the body org does not match the caller's JWT org", async () => {
    const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
    const response = await POST(
      makeRequest({
        action: "schedule_published",
        orgId: OTHER_ORG,
        startDate: "2026-05-10",
        endDate: "2026-05-16",
      }),
    );

    expect(response.status).toBe(403);
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
  });

  it("returns 500 when the dispatcher reports a pipeline failure", async () => {
    // Previously the route returned 200 even when dispatchNotificationEvent
    // failed (errors were swallowed inside the dispatcher). Now the
    // dispatcher returns a structured result and the route propagates it.
    dispatchNotificationEvent.mockResolvedValueOnce({
      success: false,
      error: "fanout failed",
    });

    const response = await POST(
      makeRequest({
        action: "shift_request_resolved",
        orgId: ORG_ID,
        requestId: REQUEST_ID,
        requestType: "swap",
        approved: true,
      }),
    );

    expect(response.status).toBe(500);
  });

  it("returns 429 when the caller is rate limited", async () => {
    checkRateLimit.mockResolvedValueOnce({
      limited: true,
      reset: Date.now() + 60_000,
      misconfigured: false,
    });

    const response = await POST(
      makeRequest({
        action: "schedule_published",
        orgId: ORG_ID,
        startDate: "2026-05-10",
        endDate: "2026-05-16",
      }),
    );

    expect(response.status).toBe(429);
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
  });
});
