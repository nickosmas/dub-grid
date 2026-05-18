import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: fromMock,
  }),
}));

import {
  fetchActiveUserSessionsForUser,
  getActiveUserSessionCutoff,
} from "./sessions";

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

describe("account session queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters client-facing sessions to the active auth window", async () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const builder = makeUserSessionsBuilder([
      {
        id: "11111111-1111-4111-8111-111111111111",
        user_id: "22222222-2222-4222-8222-222222222222",
        org_id: "44444444-4444-4444-8444-444444444444",
        supabase_session_id: "33333333-3333-4333-8333-333333333333",
        platform: "web",
        app_version: null,
        device_label: "Safari on macOS",
        ip_address: "127.0.0.1",
        last_active_at: now.toISOString(),
        created_at: now.toISOString(),
        refresh_token_hash: "hash",
      },
    ]);
    fromMock.mockReturnValue(builder);

    const sessions = await fetchActiveUserSessionsForUser(
      "22222222-2222-4222-8222-222222222222",
      now,
    );

    expect(builder.eq).toHaveBeenCalledWith(
      "user_id",
      "22222222-2222-4222-8222-222222222222",
    );
    expect(builder.not).toHaveBeenCalledWith(
      "refresh_token_hash",
      "is",
      null,
    );
    expect(builder.gte).toHaveBeenCalledWith(
      "last_active_at",
      getActiveUserSessionCutoff(now),
    );
    expect(builder.order).toHaveBeenCalledWith("last_active_at", {
      ascending: false,
    });
    expect(sessions).toHaveLength(1);
  });
});
