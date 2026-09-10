import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheMocks = vi.hoisted(() => ({
  cacheSet: vi.fn(),
}));

const serviceMocks = vi.hoisted(() => ({
  from: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cache")>();
  return { ...actual, cacheSet: cacheMocks.cacheSet };
});

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: serviceMocks.from }),
}));

import { revokeAllUserSessions, revokeSession } from "./revocation";

describe("session revocation persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheMocks.cacheSet.mockResolvedValue(undefined);
    serviceMocks.eq.mockResolvedValue({ error: null });
    serviceMocks.delete.mockReturnValue({ eq: serviceMocks.eq });
    serviceMocks.from.mockReturnValue({ delete: serviceMocks.delete });
  });

  it("removes the tracked database session used by direct PostgREST RLS", async () => {
    await revokeSession("session-1");

    expect(serviceMocks.from).toHaveBeenCalledWith("user_sessions");
    expect(serviceMocks.eq).toHaveBeenCalledWith("supabase_session_id", "session-1");
    expect(cacheMocks.cacheSet).toHaveBeenCalledOnce();
  });

  it("removes every tracked database session for user-wide revocation", async () => {
    await revokeAllUserSessions("user-1");

    expect(serviceMocks.from).toHaveBeenCalledWith("user_sessions");
    expect(serviceMocks.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(cacheMocks.cacheSet).toHaveBeenCalledOnce();
  });

  it("keeps the app revocation marker when database cleanup fails", async () => {
    serviceMocks.eq.mockResolvedValueOnce({ error: new Error("database unavailable") });

    await expect(revokeSession("session-1")).rejects.toThrow("database unavailable");
    expect(cacheMocks.cacheSet).toHaveBeenCalledOnce();
  });
});
