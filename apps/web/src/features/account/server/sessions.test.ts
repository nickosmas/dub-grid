import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const endUserSession = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: fromMock,
  }),
}));

vi.mock("@/lib/auth/revocation", () => ({
  endUserSession: (...args: unknown[]) => endUserSession(...args),
}));

import { fetchUserSessionOverviewForUser, revokeUserSessionForUser } from "./sessions";

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

  it("returns the active session per platform plus stale history", async () => {
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

    const overview = await fetchUserSessionOverviewForUser(USER_ID, { now });

    expect(builder.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(overview.active.map((s) => s.id)).toEqual(["web-active"]);
    expect(overview.stale.map((s) => s.id)).toEqual(["ios-inactive", "web-old-1", "web-old-2"]);
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

    const overview = await fetchUserSessionOverviewForUser(USER_ID, { now });

    expect(overview.active.map((s) => s.id)).toEqual(["ios-active"]);
    expect(overview.stale.map((s) => s.id)).toEqual(["android-old"]);
  });

  it("keeps multiple recently active sessions on the same platform active", async () => {
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

    const overview = await fetchUserSessionOverviewForUser(USER_ID, { now });

    expect(overview.active.map((s) => s.id)).toEqual(["safari-now", "chrome-1m-ago"]);
    expect(overview.stale).toEqual([]);
  });

  it("forces the authenticated session active when its presence tracker is behind", async () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const rows = [
      sessionRow({
        id: "other-recent",
        supabase_session_id: "other-session",
        last_active_at: "2026-05-08T11:59:00.000Z",
      }),
      sessionRow({
        id: "current-lagging",
        supabase_session_id: "current-session",
        last_active_at: "2026-05-01T09:00:00.000Z",
      }),
    ];
    const builder = makeUserSessionsBuilder(rows);
    fromMock.mockReturnValue(builder);

    const overview = await fetchUserSessionOverviewForUser(USER_ID, {
      now,
      currentSupabaseSessionId: "current-session",
    });

    expect(overview.active.map((session) => session.id)).toEqual([
      "other-recent",
      "current-lagging",
    ]);
    expect(overview.stale).toEqual([]);
  });

  it("does not treat null session identifiers as the authenticated session", async () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const builder = makeUserSessionsBuilder([
      sessionRow({
        id: "unidentified-old-session",
        supabase_session_id: null,
        last_active_at: "2026-05-01T09:00:00.000Z",
      }),
    ]);
    fromMock.mockReturnValue(builder);

    const overview = await fetchUserSessionOverviewForUser(USER_ID, {
      now,
      currentSupabaseSessionId: null,
    });

    expect(overview.active).toEqual([]);
    expect(overview.stale.map((session) => session.id)).toEqual(["unidentified-old-session"]);
  });

  it("caps stale sessions at the 5 most recently used", async () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const rows = [
      sessionRow({ id: "web-active", platform: "web", last_active_at: now.toISOString() }),
      ...Array.from({ length: 7 }, (_, i) =>
        sessionRow({
          id: `stale-${i}`,
          platform: "web",
          last_active_at: new Date(now.getTime() - (i + 1) * 86_400_000).toISOString(),
        }),
      ),
    ];
    const builder = makeUserSessionsBuilder(rows);
    fromMock.mockReturnValue(builder);

    const overview = await fetchUserSessionOverviewForUser(USER_ID, { now });

    expect(overview.stale).toHaveLength(5);
    expect(overview.stale.map((s) => s.id)).toEqual([
      "stale-0",
      "stale-1",
      "stale-2",
      "stale-3",
      "stale-4",
    ]);
  });
});

describe("revokeUserSessionForUser", () => {
  function revokeBuilders(lookup: { data: unknown; error: unknown }) {
    const deleteBuilder = {
      eq: vi.fn(() => deleteBuilder),
      then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
    };
    const selectBuilder = {
      select: vi.fn(() => selectBuilder),
      eq: vi.fn(() => selectBuilder),
      maybeSingle: vi.fn().mockResolvedValue(lookup),
      delete: vi.fn(() => deleteBuilder),
      deleteBuilder,
    };
    fromMock.mockReturnValue(selectBuilder);
    return selectBuilder;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    endUserSession.mockResolvedValue(undefined);
  });

  // A marker alone expires with the access token and the refresh token brings
  // the device back, so the provider session is ended too (41b1).
  it("ends the device's provider session, not only its marker", async () => {
    const builder = revokeBuilders({ data: { supabase_session_id: "session-9" }, error: null });

    await expect(revokeUserSessionForUser(USER_ID, "hash")).resolves.toBe(true);

    expect(endUserSession).toHaveBeenCalledWith(USER_ID, "session-9");
    expect(builder.delete).toHaveBeenCalledOnce();
    // Only this user's row with this hash, never another account's.
    expect(builder.deleteBuilder.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(builder.deleteBuilder.eq).toHaveBeenCalledWith("refresh_token_hash", "hash");
  });

  it("reports that nothing matched, so callers do not record a revoke", async () => {
    revokeBuilders({ data: null, error: null });

    await expect(revokeUserSessionForUser(USER_ID, "unknown")).resolves.toBe(false);
    expect(endUserSession).not.toHaveBeenCalled();
  });

  it("still removes a row that never recorded its provider session", async () => {
    const builder = revokeBuilders({ data: { supabase_session_id: null }, error: null });

    await revokeUserSessionForUser(USER_ID, "hash");

    expect(endUserSession).not.toHaveBeenCalled();
    expect(builder.delete).toHaveBeenCalledOnce();
  });

  it("reports a failed lookup instead of quietly skipping the provider session", async () => {
    const builder = revokeBuilders({ data: null, error: new Error("database unavailable") });

    await expect(revokeUserSessionForUser(USER_ID, "hash")).rejects.toThrow("database unavailable");
    expect(endUserSession).not.toHaveBeenCalled();
    expect(builder.delete).not.toHaveBeenCalled();
  });
});
