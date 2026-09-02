// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveCalendarFeed = vi.fn();
const renderPublishedEmployeeCalendar = vi.fn();
const serviceClient = { marker: "service" };

vi.mock("@/features/account/server", () => ({
  resolveCalendarFeed: (token: string) => resolveCalendarFeed(token),
  renderPublishedEmployeeCalendar: (...args: unknown[]) => renderPublishedEmployeeCalendar(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => serviceClient,
}));

import { GET } from "./route";

const TOKEN = "A".repeat(43);

function request() {
  return new NextRequest(`https://calm.localhost/api/calendar/feed/${TOKEN}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveCalendarFeed.mockResolvedValue(null);
  renderPublishedEmployeeCalendar.mockResolvedValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR");
});

describe("GET /api/calendar/feed/[token]", () => {
  it("returns the same opaque 404 for invalid, revoked, or inactive subscriptions", async () => {
    const response = await GET(request(), { params: Promise.resolve({ token: TOKEN }) });

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("Calendar feed unavailable");
    expect(renderPublishedEmployeeCalendar).not.toHaveBeenCalled();
  });

  it("polls without cookies and returns a published ICS feed", async () => {
    const employee = {
      id: "employee-1",
      orgId: "org-1",
      userId: "user-1",
      firstName: "Avery",
      lastName: "Stone",
      timeZone: "America/Los_Angeles",
    };
    resolveCalendarFeed.mockResolvedValue(employee);

    const response = await GET(request(), { params: Promise.resolve({ token: TOKEN }) });

    expect(resolveCalendarFeed).toHaveBeenCalledWith(TOKEN);
    expect(renderPublishedEmployeeCalendar).toHaveBeenCalledWith(serviceClient, employee, 12);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(await response.text()).toContain("BEGIN:VCALENDAR");
  });
});
