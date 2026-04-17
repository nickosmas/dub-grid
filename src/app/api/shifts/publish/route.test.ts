import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const validateCsrfOrigin = vi.fn();
const checkRateLimit = vi.fn();
const loggerError = vi.fn();
const captureException = vi.fn();
const fetchScheduleDraftBreakdown = vi.fn();
const publishScheduleDirect = vi.fn();
const membershipMaybeSingle = vi.fn();
const profileSingle = vi.fn();
const auditInsert = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: (...args: unknown[]) => loggerError(...args),
  },
}));

vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

vi.mock("@/lib/server/schedule-draft-safety", () => ({
  fetchScheduleDraftBreakdown: (...args: unknown[]) => fetchScheduleDraftBreakdown(...args),
  publishScheduleDirect: (...args: unknown[]) => publishScheduleDirect(...args),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "organization_memberships") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: membershipMaybeSingle,
              })),
            })),
          })),
        };
      }

      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: profileSingle,
            })),
          })),
        };
      }

      if (table === "audit_log") {
        return {
          insert: auditInsert,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { POST } from "@/app/api/shifts/publish/route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/shifts/publish", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
      "user-agent": "vitest",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/shifts/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUser.mockResolvedValue({
      user: {
        id: "22222222-2222-4222-8222-222222222222",
        email: "admin@example.com",
      },
    });
    checkRateLimit.mockResolvedValue({
      limited: false,
      reset: null,
      misconfigured: false,
    });
    membershipMaybeSingle.mockResolvedValue({
      data: {
        org_role: "admin",
        admin_permissions: { canPublishSchedule: true },
      },
      error: null,
    });
    profileSingle.mockResolvedValue({
      data: { platform_role: "none" },
      error: null,
    });
    auditInsert.mockResolvedValue({ error: null });
  });

  it("returns a conflict response with the latest summary when drafts changed elsewhere", async () => {
    fetchScheduleDraftBreakdown.mockResolvedValue({
      newShifts: 1,
      modifiedShifts: 1,
      deletedShifts: 0,
      newNotes: 0,
      deletedNotes: 0,
      totalChanges: 2,
    });

    const response = await POST(
      makeRequest({
        orgId: "11111111-1111-4111-8111-111111111111",
        startDate: "2026-04-12",
        endDate: "2026-04-18",
        expectedSummary: {
          newShifts: 1,
          modifiedShifts: 0,
          deletedShifts: 0,
          newNotes: 0,
          deletedNotes: 0,
          totalChanges: 1,
        },
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        code: "SCHEDULE_DRAFT_CONFLICT",
        summary: expect.objectContaining({
          totalChanges: 2,
        }),
      }),
    );
    expect(publishScheduleDirect).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("publishes and records the reviewed summary in the audit log", async () => {
    const summary = {
      newShifts: 2,
      modifiedShifts: 1,
      deletedShifts: 0,
      newNotes: 1,
      deletedNotes: 0,
      totalChanges: 4,
    };
    fetchScheduleDraftBreakdown.mockResolvedValue(summary);
    publishScheduleDirect.mockResolvedValue(undefined);

    const response = await POST(
      makeRequest({
        orgId: "11111111-1111-4111-8111-111111111111",
        startDate: "2026-04-12",
        endDate: "2026-04-18",
        expectedSummary: summary,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        success: true,
        summary,
      }),
    );
    expect(publishScheduleDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "11111111-1111-4111-8111-111111111111",
        startDate: "2026-04-12",
        endDate: "2026-04-18",
        actorId: "22222222-2222-4222-8222-222222222222",
      }),
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "schedule.published",
        details: expect.objectContaining({
          startDate: "2026-04-12",
          endDate: "2026-04-18",
          summary,
        }),
      }),
    );
  });
});
