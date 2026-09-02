// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthenticatedUserWithClaims: vi.fn(),
  getLinkedCalendarEmployee: vi.fn(),
  renderPublishedEmployeeCalendar: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) =>
    mocks.requireAuthenticatedUserWithClaims(req),
}));
vi.mock("@/features/account/server", () => ({
  CalendarSubscriptionError: class CalendarSubscriptionError extends Error {},
  getLinkedCalendarEmployee: (...args: unknown[]) => mocks.getLinkedCalendarEmployee(...args),
  renderPublishedEmployeeCalendar: (...args: unknown[]) =>
    mocks.renderPublishedEmployeeCalendar(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => mocks.checkRateLimit(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ service: true }),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuthenticatedUserWithClaims.mockResolvedValue({
    user: { id: "user-1" },
    claims: { org_id: "effective-org" },
  });
  mocks.checkRateLimit.mockResolvedValue({ limited: false });
  mocks.getLinkedCalendarEmployee.mockResolvedValue({
    id: "employee-1",
    orgId: "effective-org",
    userId: "user-1",
    firstName: "Avery",
    lastName: "Stone",
    timeZone: "America/Los_Angeles",
  });
  mocks.renderPublishedEmployeeCalendar.mockResolvedValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR");
});

describe("GET /api/calendar", () => {
  it("retains authenticated export while scoping it to the effective organization", async () => {
    const response = await GET(new NextRequest("https://calm.localhost/api/calendar?weeks=99"));

    expect(mocks.getLinkedCalendarEmployee).toHaveBeenCalledWith("user-1", "effective-org");
    expect(mocks.renderPublishedEmployeeCalendar).toHaveBeenCalledWith(
      { service: true },
      expect.objectContaining({ id: "employee-1", orgId: "effective-org" }),
      12,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("attachment");
  });
});
