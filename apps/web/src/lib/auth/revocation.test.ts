import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheMocks = vi.hoisted(() => ({
  cacheSetOrThrow: vi.fn(),
  cacheGetMany: vi.fn(),
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
  return {
    ...actual,
    cacheSetOrThrow: cacheMocks.cacheSetOrThrow,
    cacheGetMany: cacheMocks.cacheGetMany,
  };
});

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: serviceMocks.from, rpc: serviceMocks.rpc }),
}));

import {
  endUserSession,
  endUserSessions,
  isSessionRevoked,
  resetRevocationMemo,
  revokeAllUserSessions,
  revokeOtherUserSessions,
  revokeSession,
} from "./revocation";

describe("session revocation persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheMocks.cacheSetOrThrow.mockResolvedValue(undefined);
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

    expect(cacheMocks.cacheSetOrThrow).toHaveBeenCalledOnce();
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

  // A marker alone expires with the access token; the refresh token would
  // bring the device back (41b1).
  it("ends one provider session, then marks its tokens revoked", async () => {
    await endUserSession("user-1", "session-1");

    expect(serviceMocks.rpc).toHaveBeenCalledWith("end_user_auth_session", {
      p_user_id: "user-1",
      p_session_id: "session-1",
    });
    expect(cacheMocks.cacheSetOrThrow).toHaveBeenCalledOnce();
    expect(serviceMocks.eq).toHaveBeenCalledWith("supabase_session_id", "session-1");
    expect(serviceMocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      cacheMocks.cacheSetOrThrow.mock.invocationCallOrder[0],
    );
  });

  // The marker deletes DubGrid's row; if it ran first, a retry after a failed
  // provider call would find no row and end nothing.
  it("keeps the session's row when the provider call fails, so a retry can end it", async () => {
    serviceMocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("auth schema down") });

    await expect(endUserSession("user-1", "session-1")).rejects.toThrow("auth schema down");
    expect(cacheMocks.cacheSetOrThrow).not.toHaveBeenCalled();
    expect(serviceMocks.delete).not.toHaveBeenCalled();
  });

  it("removes the tracked database session used by direct PostgREST RLS", async () => {
    await revokeSession("session-1");

    expect(serviceMocks.from).toHaveBeenCalledWith("user_sessions");
    expect(serviceMocks.eq).toHaveBeenCalledWith("supabase_session_id", "session-1");
    expect(cacheMocks.cacheSetOrThrow).toHaveBeenCalledOnce();
  });

  it("removes every tracked database session for user-wide revocation", async () => {
    await revokeAllUserSessions("user-1");

    expect(serviceMocks.from).toHaveBeenCalledWith("user_sessions");
    expect(serviceMocks.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(cacheMocks.cacheSetOrThrow).toHaveBeenCalledOnce();
  });

  it("keeps the app revocation marker when database cleanup fails", async () => {
    serviceMocks.eq.mockResolvedValueOnce({ error: new Error("database unavailable") });

    await expect(revokeSession("session-1")).rejects.toThrow("database unavailable");
    expect(cacheMocks.cacheSetOrThrow).toHaveBeenCalledOnce();
  });

  // A copied access token stays valid until it expires unless its marker is
  // written, so a lost write must fail the revocation rather than pass as done.
  it("fails the revocation when its marker cannot be written", async () => {
    cacheMocks.cacheSetOrThrow.mockRejectedValue(new Error("Cache write timed out"));

    await expect(revokeSession("session-1")).rejects.toThrow("Cache write timed out");
    await expect(revokeAllUserSessions("user-1")).rejects.toThrow("Cache write timed out");
    expect(serviceMocks.delete).not.toHaveBeenCalled();
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
    expect(cacheMocks.cacheSetOrThrow).toHaveBeenCalledOnce();
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
    expect(cacheMocks.cacheSetOrThrow).not.toHaveBeenCalled();
  });

  it("revokes the collected peers together rather than one after another", async () => {
    serviceMocks.range.mockResolvedValueOnce({
      data: [{ supabase_session_id: "peer-1" }, { supabase_session_id: "peer-2" }],
      error: null,
    });
    let releaseFirst: () => void = () => {};
    cacheMocks.cacheSetOrThrow.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );

    const revoking = revokeOtherUserSessions("user-1", "current");
    await vi.waitFor(() => expect(cacheMocks.cacheSetOrThrow).toHaveBeenCalledTimes(2));
    releaseFirst();
    await revoking;

    expect(serviceMocks.eq).toHaveBeenCalledWith("supabase_session_id", "peer-1");
    expect(serviceMocks.eq).toHaveBeenCalledWith("supabase_session_id", "peer-2");
  });

  it("fails when any peer's marker cannot be written", async () => {
    serviceMocks.range.mockResolvedValueOnce({
      data: [{ supabase_session_id: "peer-1" }, { supabase_session_id: "peer-2" }],
      error: null,
    });
    cacheMocks.cacheSetOrThrow
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Cache write timed out"));

    await expect(revokeOtherUserSessions("user-1", "current")).rejects.toThrow(
      "Cache write timed out",
    );
  });
});

describe("revocation lookups", () => {
  const token = { userId: "user-1", sessionId: "session-1", issuedAtMs: Date.now() };

  beforeEach(() => {
    vi.clearAllMocks();
    resetRevocationMemo();
    cacheMocks.cacheGetMany.mockResolvedValue([null, null]);
    cacheMocks.cacheSetOrThrow.mockResolvedValue(undefined);
    serviceMocks.eq.mockResolvedValue({ error: null });
    serviceMocks.delete.mockReturnValue({ eq: serviceMocks.eq });
    serviceMocks.from.mockReturnValue({ delete: serviceMocks.delete });
  });

  it("answers a cold fan-out for one session with a single Redis read", async () => {
    const answers = await Promise.all([
      isSessionRevoked(token),
      isSessionRevoked(token),
      isSessionRevoked(token),
    ]);

    expect(answers).toEqual([false, false, false]);
    expect(cacheMocks.cacheGetMany).toHaveBeenCalledOnce();
  });

  it("does not let a read begun before a revocation answer for after it", async () => {
    let answerFirstRead: (markers: (number | null)[]) => void = () => {};
    cacheMocks.cacheGetMany.mockReturnValueOnce(
      new Promise((resolve) => {
        answerFirstRead = resolve;
      }),
    );
    const before = isSessionRevoked(token);

    await revokeSession("session-1");
    cacheMocks.cacheGetMany.mockResolvedValueOnce([null, Date.now()]);
    const after = isSessionRevoked(token);
    answerFirstRead([null, null]);

    await expect(after).resolves.toBe(true);
    await before;
    await expect(isSessionRevoked(token)).resolves.toBe(true);
    expect(cacheMocks.cacheGetMany).toHaveBeenCalledTimes(2);
  });
});
