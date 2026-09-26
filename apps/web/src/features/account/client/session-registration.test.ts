import { describe, expect, it, vi } from "vitest";
import { createSessionRegistration, SessionRegistrationError } from "./session-registration";

function session(sessionId: string): { access_token: string } {
  const payload = btoa(JSON.stringify({ session_id: sessionId }));
  return { access_token: `header.${payload}.signature` };
}

describe("createSessionRegistration", () => {
  it("coalesces concurrent and recently completed attempts for the same session", async () => {
    let resolveSend: (() => void) | undefined;
    const send = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
    );
    const register = createSessionRegistration(send);

    const first = register(session("session-1"));
    const second = register(session("session-1"));
    const third = register(session("session-1"));

    expect(send).toHaveBeenCalledTimes(0);
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);

    resolveSend?.();
    await Promise.all([first, second, third]);
    await register(session("session-1"));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("registers the same session again after the short dedupe window", async () => {
    let currentTime = 1_000;
    const send = vi.fn().mockResolvedValue(undefined);
    const register = createSessionRegistration(send, {
      now: () => currentTime,
      dedupeWindowMs: 5_000,
    });

    await register(session("session-1"));
    currentTime += 5_001;
    await register(session("session-1"));

    expect(send).toHaveBeenCalledTimes(2);
  });

  it("registers a genuinely different session immediately", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const register = createSessionRegistration(send);

    await Promise.all([register(session("session-1")), register(session("session-2"))]);

    expect(send).toHaveBeenCalledTimes(2);
  });

  it("allows the same session to retry after a failed request", async () => {
    const send = vi.fn().mockRejectedValue(new Error("network unavailable"));
    const register = createSessionRegistration(send, { sleep: async () => undefined });

    await expect(register(session("session-1"))).rejects.toThrow("network unavailable");
    expect(send).toHaveBeenCalledTimes(3);
    send.mockResolvedValueOnce(undefined);
    await expect(register(session("session-1"))).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("does not deduplicate malformed tokens whose session identity is unknown", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const register = createSessionRegistration(send);

    await Promise.all([
      register({ access_token: "not-a-jwt" }),
      register({ access_token: "not-a-jwt" }),
    ]);

    expect(send).toHaveBeenCalledTimes(2);
  });

  describe("retries", () => {
    const sleep = vi.fn(async () => undefined);

    it("retries a refused report and reports once it lands", async () => {
      const send = vi
        .fn()
        .mockRejectedValueOnce(new SessionRegistrationError(409))
        .mockResolvedValueOnce(undefined);
      const register = createSessionRegistration(send, { sleep });

      await register(session("session-1"));

      expect(send).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledWith(1_000);
      await register(session("session-1"));
      expect(send).toHaveBeenCalledTimes(2);
    });

    it("stops after three attempts and does not remember the failure as sent", async () => {
      const send = vi.fn().mockRejectedValue(new SessionRegistrationError(500));
      const register = createSessionRegistration(send, { sleep });

      await expect(register(session("session-1"))).rejects.toBeInstanceOf(SessionRegistrationError);
      expect(send).toHaveBeenCalledTimes(3);

      send.mockResolvedValueOnce(undefined);
      await register(session("session-1"));
      expect(send).toHaveBeenCalledTimes(4);
    });

    it("stops retrying once another session has replaced this one", async () => {
      const send = vi.fn().mockRejectedValue(new SessionRegistrationError(500));
      let replacement: Promise<void> | null = null;
      let register: ReturnType<typeof createSessionRegistration>;
      const sleepAndMaybeReplace = vi.fn(async () => {
        replacement ??= register(session("session-2")).catch(() => {});
      });
      register = createSessionRegistration(send, { sleep: sleepAndMaybeReplace });

      await expect(register(session("session-1"))).rejects.toBeInstanceOf(SessionRegistrationError);
      await replacement;
      // One attempt for session-1, which then stops, and three for session-2.
      // Without the check session-1 would make all three of its own.
      expect(send).toHaveBeenCalledTimes(4);
    });

    it("does not retry a report that would fail the same way again", async () => {
      const send = vi.fn().mockRejectedValue(new SessionRegistrationError(401));
      const register = createSessionRegistration(send, { sleep });

      await expect(register(session("session-1"))).rejects.toBeInstanceOf(SessionRegistrationError);
      expect(send).toHaveBeenCalledOnce();
    });
  });
});
