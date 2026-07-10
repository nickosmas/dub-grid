import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: fromMock,
  }),
}));

import { fetchImportantUserSessionsForUser } from "./sessions";

const USER_ID = "22222222-2222-4222-8222-222222222222";

function makeUserSessionsBuilder(rows: Record<string, unknown>[]) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  return builder;
}

function sessionRow(overrides: Record<string, unknown>) {
  return {
    id: "row",
    user_id: USER_ID,
    org_id: "44444444-4444-4444-8444-444444444444",
    supabase_session_id: "session",
    platform: "web",
    app_version: null,
    device_label: "Device",
    ip_address: "127.0.0.1",
    last_active_at: "2026-05-08T12:00:00.000Z",
    created_at: "2026-05-08T12:00:00.000Z",
    refresh_token_hash: "hash",
    ...overrides,
  };
}

describe("account session queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only the active + last-inactive session per platform", async () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const rows = [
      sessionRow({
        id: "web-active",
        platform: "web",
        last_active_at: now.toISOString(),
      }),
      sessionRow({
        id: "web-old-1",
        platform: "web",
        last_active_at: "2026-05-01T09:00:00.000Z",
      }),
      sessionRow({
        id: "web-old-2",
        platform: "web",
        last_active_at: "2026-04-20T09:00:00.000Z",
      }),
      sessionRow({
        id: "ios-inactive",
        platform: "ios",
        last_active_at: "2026-05-07T10:00:00.000Z",
      }),
    ];
    const builder = makeUserSessionsBuilder(rows);
    fromMock.mockReturnValue(builder);

    const sessions = await fetchImportantUserSessionsForUser(USER_ID, now);

    expect(builder.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(sessions.map((s) => s.id)).toEqual(["web-active", "ios-inactive", "web-old-1"]);
    expect(sessions.map((s) => s.isActive)).toEqual([true, false, false]);
  });

  it("groups ios and android sessions together as mobile", async () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const rows = [
      sessionRow({ id: "ios-active", platform: "ios", last_active_at: now.toISOString() }),
      sessionRow({
        id: "android-old",
        platform: "android",
        last_active_at: "2026-05-01T09:00:00.000Z",
      }),
    ];
    const builder = makeUserSessionsBuilder(rows);
    fromMock.mockReturnValue(builder);

    const sessions = await fetchImportantUserSessionsForUser(USER_ID, now);

    expect(sessions.map((s) => s.id)).toEqual(["ios-active", "android-old"]);
    expect(sessions.map((s) => s.isActive)).toEqual([true, false]);
  });

  it("marks only the single most recent same-platform session as active", async () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const rows = [
      sessionRow({ id: "safari-now", platform: "web", last_active_at: now.toISOString() }),
      sessionRow({
        id: "chrome-1m-ago",
        platform: "web",
        last_active_at: "2026-05-08T11:59:00.000Z",
      }),
    ];
    const builder = makeUserSessionsBuilder(rows);
    fromMock.mockReturnValue(builder);

    const sessions = await fetchImportantUserSessionsForUser(USER_ID, now);

    expect(sessions.map((s) => s.id)).toEqual(["safari-now", "chrome-1m-ago"]);
    expect(sessions.map((s) => s.isActive)).toEqual([true, false]);
  });
});
