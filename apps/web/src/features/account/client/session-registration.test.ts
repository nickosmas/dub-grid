import { describe, expect, it, vi } from "vitest";
import { createSessionRegistration } from "./session-registration";

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
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(undefined);
    const register = createSessionRegistration(send);

    await expect(register(session("session-1"))).rejects.toThrow("network unavailable");
    await expect(register(session("session-1"))).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(2);
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
});
