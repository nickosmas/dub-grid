import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const getCalendarSubscriptionStatus = vi.fn();
const issueCalendarSubscription = vi.fn();
const revokeCalendarSubscription = vi.fn();

vi.mock("@/features/mobile/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/mobile/server")>(
    "@/features/mobile/server",
  );
  return { ...actual, requireMobileAuth };
});

vi.mock("@/features/account/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/account/server")>(
    "@/features/account/server",
  );
  return {
    ...actual,
    getCalendarSubscriptionStatus: (...args: unknown[]) => getCalendarSubscriptionStatus(...args),
    issueCalendarSubscription: (...args: unknown[]) => issueCalendarSubscription(...args),
    revokeCalendarSubscription: (...args: unknown[]) => revokeCalendarSubscription(...args),
  };
});

vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

function makeRequest() {
  return { nextUrl: { origin: "https://calmhaven.dubgrid.app" } } as never;
}

describe("mobile profile calendar subscription route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMobileAuth.mockResolvedValue({
      user: { id: "user-1" },
      currentOrg: { id: "org-1" },
    });
  });

  it("returns auth failures unchanged", async () => {
    requireMobileAuth.mockResolvedValue({
      response: NextResponse.json({ error: "Invalid session" }, { status: 401 }),
    });
    const { GET } = await import("./profile-calendar-subscription");
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    expect(getCalendarSubscriptionStatus).not.toHaveBeenCalled();
  });

  it("answers 404 when the caller has no current organization", async () => {
    requireMobileAuth.mockResolvedValue({ user: { id: "user-1" }, currentOrg: null });
    const { POST } = await import("./profile-calendar-subscription");
    const response = await POST(makeRequest());
    expect(response.status).toBe(404);
    expect(issueCalendarSubscription).not.toHaveBeenCalled();
  });

  it("reports status scoped to the caller and organization", async () => {
    getCalendarSubscriptionStatus.mockResolvedValue({
      active: true,
      issuedAt: "2026-09-01T00:00:00.000Z",
    });
    const { GET } = await import("./profile-calendar-subscription");
    const response = await GET(makeRequest());
    expect(getCalendarSubscriptionStatus).toHaveBeenCalledWith("user-1", "org-1");
    expect(await response.json()).toEqual({ active: true, issuedAt: "2026-09-01T00:00:00.000Z" });
  });

  it("creates and returns an absolute feed URL built from the request origin", async () => {
    issueCalendarSubscription.mockResolvedValue({
      rawToken: "tok_abc",
      issuedAt: "2026-09-01T00:00:00.000Z",
    });
    const { POST, PUT } = await import("./profile-calendar-subscription");
    const created = await POST(makeRequest());
    expect(issueCalendarSubscription).toHaveBeenCalledWith("user-1", "org-1", "create");
    expect(await created.json()).toEqual({
      active: true,
      issuedAt: "2026-09-01T00:00:00.000Z",
      feedUrl: "https://calmhaven.dubgrid.app/api/calendar/feed/tok_abc",
    });

    await PUT(makeRequest());
    expect(issueCalendarSubscription).toHaveBeenLastCalledWith("user-1", "org-1", "rotate");
  });

  it("maps subscription errors to the web route's status codes", async () => {
    const { CalendarSubscriptionError } = await import("@/features/account/server");
    issueCalendarSubscription.mockRejectedValueOnce(new CalendarSubscriptionError("not_linked"));
    const { POST } = await import("./profile-calendar-subscription");
    expect((await POST(makeRequest())).status).toBe(404);

    issueCalendarSubscription.mockRejectedValueOnce(
      new CalendarSubscriptionError("already_active"),
    );
    expect((await POST(makeRequest())).status).toBe(409);
  });

  it("revokes and answers inactive", async () => {
    revokeCalendarSubscription.mockResolvedValue(undefined);
    const { DELETE } = await import("./profile-calendar-subscription");
    const response = await DELETE(makeRequest());
    expect(revokeCalendarSubscription).toHaveBeenCalledWith("user-1", "org-1");
    expect(await response.json()).toEqual({ active: false, issuedAt: null });
  });
});
