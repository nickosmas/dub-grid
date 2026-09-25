import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheMocks = vi.hoisted(() => ({
  cacheSet: vi.fn(),
}));

const serviceMocks = vi.hoisted(() => ({
  from: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  selectEq: vi.fn(),
  neq: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cache")>();
  return { ...actual, cacheSet: cacheMocks.cacheSet };
});

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: serviceMocks.from, rpc: serviceMocks.rpc }),
}));

import {
  endUserSessions,
  revokeAllUserSessions,
  revokeOtherUserSessions,
  revokeSession,
} from "./revocation";

describe("session revocation persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheMocks.cacheSet.mockResolvedValue(undefined);
    serviceMocks.eq.mockResolvedValue({ error: null });
    serviceMocks.delete.mockReturnValue({ eq: serviceMocks.eq });
    serviceMocks.from.mockReturnValue({ delete: serviceMocks.delete, select: serviceMocks.select });
    serviceMocks.select.mockReturnValue({ eq: serviceMocks.selectEq });
    serviceMocks.selectEq.mockReturnValue({ neq: serviceMocks.neq });
    serviceMocks.neq.mockReturnValue({ order: serviceMocks.order });
    serviceMocks.order.mockReturnValue({ range: serviceMocks.range });
    serviceMocks.range.mockReset().mockResolvedValue({ data: [], error: null });
    serviceMocks.rpc.mockResolvedValue({ data: 1, error: null });
  });

  // A watermark alone lets the refresh token mint a newer, accepted token, so
  // ending someone's sessions must also delete them at the provider (F-21).
  it("ends every provider session as well as rejecting current tokens", async () => {
    await endUserSessions("user-1");

    expect(cacheMocks.cacheSet).toHaveBeenCalledOnce();
    expect(serviceMocks.rpc).toHaveBeenCalledWith("end_user_auth_sessions", {
      p_user_id: "user-1",
      p_keep_session_id: null,
    });
  });

  it("spares the caller's own session when asked to", async () => {
    await endUserSessions("user-1", { keepSessionId: "current" });

    expect(serviceMocks.neq).toHaveBeenCalledWith("supabase_session_id", "current");
    expect(serviceMocks.rpc).toHaveBeenCalledWith("end_user_auth_sessions", {
      p_user_id: "user-1",
      p_keep_session_id: "current",
    });
  });

  it("reports a provider failure rather than claiming the sessions ended", async () => {
    serviceMocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("auth schema down") });

    await expect(endUserSessions("user-1")).rejects.toThrow("auth schema down");
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

  it("revokes only the user's tracked peers, including sessions without a refresh hash", async () => {
    serviceMocks.range.mockResolvedValueOnce({
      data: [
        { supabase_session_id: "peer-1" },
        { supabase_session_id: "peer-1" },
        { supabase_session_id: "current" },
        { supabase_session_id: null },
      ],
      error: null,
    });
    await revokeOtherUserSessions("user-1", "current");
    expect(serviceMocks.selectEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(serviceMocks.neq).toHaveBeenCalledWith("supabase_session_id", "current");
    expect(serviceMocks.eq).toHaveBeenCalledExactlyOnceWith("supabase_session_id", "peer-1");
    expect(cacheMocks.cacheSet).toHaveBeenCalledOnce();
  });

  it("collects every page before deletion so offsets cannot skip peers", async () => {
    serviceMocks.range
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, () => ({ supabase_session_id: "peer-1" })),
        error: null,
      })
      .mockResolvedValueOnce({ data: [{ supabase_session_id: "peer-2" }], error: null });
    await revokeOtherUserSessions("user-1", "current");
    expect(serviceMocks.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(serviceMocks.range).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(serviceMocks.eq).toHaveBeenCalledTimes(2);
    expect(serviceMocks.range.mock.invocationCallOrder[1]).toBeLessThan(
      serviceMocks.delete.mock.invocationCallOrder[0],
    );
  });

  it("does not silently ignore lookup failures", async () => {
    serviceMocks.range.mockResolvedValueOnce({ data: null, error: new Error("lookup failed") });
    await expect(revokeOtherUserSessions("user-1", "current")).rejects.toThrow("lookup failed");
    expect(serviceMocks.delete).not.toHaveBeenCalled();
    expect(cacheMocks.cacheSet).not.toHaveBeenCalled();
  });
});
