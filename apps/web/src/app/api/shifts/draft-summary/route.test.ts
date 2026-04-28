import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const checkRateLimit = vi.fn();
const loggerError = vi.fn();
const captureException = vi.fn();
const fetchScheduleDraftBreakdown = vi.fn();
const membershipMaybeSingle = vi.fn();
const profileSingle = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));

vi.mock("@/lib/rate-limit", () => ({
  scheduleReviewLimiter: {},
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

      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { GET } from "@/app/api/shifts/draft-summary/route";

function makeRequest(query = "orgId=11111111-1111-4111-8111-111111111111&scope=all&startDate=2026-04-12&endDate=2026-04-18") {
  return new NextRequest(`http://localhost/api/shifts/draft-summary?${query}`);
}

describe("GET /api/shifts/draft-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUser.mockResolvedValue({
      user: {
        id: "22222222-2222-4222-8222-222222222222",
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
  });

  it("returns a friendly rate-limit error for rapid review refreshes", async () => {
    checkRateLimit.mockResolvedValue({
      limited: true,
      reset: Date.now() + 10_000,
      misconfigured: false,
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "Too many schedule review requests. Please wait a moment and try again.",
    });
    expect(fetchScheduleDraftBreakdown).not.toHaveBeenCalled();
  });

  it("returns the latest summary for an authorized admin", async () => {
    fetchScheduleDraftBreakdown.mockResolvedValue({
      newShifts: 0,
      modifiedShifts: 1,
      deletedShifts: 0,
      newNotes: 0,
      deletedNotes: 0,
      totalChanges: 1,
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      summary: {
        newShifts: 0,
        modifiedShifts: 1,
        deletedShifts: 0,
        newNotes: 0,
        deletedNotes: 0,
        totalChanges: 1,
      },
    });
    expect(fetchScheduleDraftBreakdown).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "11111111-1111-4111-8111-111111111111",
        startDate: "2026-04-12",
        endDate: "2026-04-18",
        serviceClient: expect.any(Object),
      }),
    );
  });
});
