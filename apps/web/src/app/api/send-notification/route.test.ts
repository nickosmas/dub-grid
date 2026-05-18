import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedUser = vi.fn();
const requireOrgPermissions = vi.fn();
const checkRateLimit = vi.fn();
const dispatchNotificationEvent = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

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
const TARGET_USER_ID = "33333333-3333-4333-8333-333333333333";

const basePermissions = {
  isGridmaster: false,
  isSuperAdmin: false,
  canPublishSchedule: false,
  canApproveShiftRequests: false,
};

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/send-notification", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/send-notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUser.mockResolvedValue({
      user: { id: "actor-user", email: "actor@example.com" },
    });
    checkRateLimit.mockResolvedValue({
      limited: false,
      reset: null,
      misconfigured: false,
    });
    requireOrgPermissions.mockImplementation(
      async (
        _req: NextRequest,
        _orgId: string,
        isAllowed: (permissions: typeof basePermissions) => boolean,
      ) =>
        isAllowed(basePermissions)
          ? { actor: { id: "actor-user" }, permissions: basePermissions }
          : {
              response: NextResponse.json(
                { error: "Insufficient permissions" },
                { status: 403 },
              ),
            },
    );
    dispatchNotificationEvent.mockResolvedValue(undefined);
  });

  it("rejects role_changed unless the caller is gridmaster or super admin", async () => {
    const response = await POST(
      makeRequest({
        action: "role_changed",
        orgId: ORG_ID,
        targetUserId: TARGET_USER_ID,
        fromRole: "user",
        toRole: "admin",
      }),
    );

    expect(response.status).toBe(403);
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
  });

  it("allows schedule_published for callers with publish permission", async () => {
    requireOrgPermissions.mockImplementationOnce(
      async (
        _req: NextRequest,
        _orgId: string,
        isAllowed: (permissions: typeof basePermissions) => boolean,
      ) => {
        const permissions = { ...basePermissions, canPublishSchedule: true };
        return isAllowed(permissions)
          ? { actor: { id: "actor-user" }, permissions }
          : {
              response: NextResponse.json(
                { error: "Insufficient permissions" },
                { status: 403 },
              ),
            };
      },
    );

    const response = await POST(
      makeRequest({
        action: "schedule_published",
        orgId: ORG_ID,
        startDate: "2026-05-10",
        endDate: "2026-05-16",
      }),
    );

    expect(response.status).toBe(200);
    expect(dispatchNotificationEvent).toHaveBeenCalledWith(
      "actor-user",
      expect.objectContaining({ action: "schedule_published", orgId: ORG_ID }),
    );
  });

  it("allows shift request events for callers who can approve requests", async () => {
    requireOrgPermissions.mockImplementationOnce(
      async (
        _req: NextRequest,
        _orgId: string,
        isAllowed: (permissions: typeof basePermissions) => boolean,
      ) => {
        const permissions = {
          ...basePermissions,
          canApproveShiftRequests: true,
        };
        return isAllowed(permissions)
          ? { actor: { id: "actor-user" }, permissions }
          : {
              response: NextResponse.json(
                { error: "Insufficient permissions" },
                { status: 403 },
              ),
            };
      },
    );

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
});
