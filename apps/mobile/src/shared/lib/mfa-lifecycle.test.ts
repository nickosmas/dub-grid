import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enrollMobileMfa,
  reauthenticateMobileMfa,
  removeMobileMfa,
  withMfaDeadline,
  MfaRequestTimeoutError,
} from "./mfa-lifecycle";

const request = vi.hoisted(() => vi.fn());
const setSession = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({ mobileApiRequest: request }));
vi.mock("./supabase", () => ({ getSupabaseClient: () => ({ auth: { setSession } }) }));
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe("MFA transport and deadlines", () => {
  it("installs only the successful replacement session", async () => {
    request.mockRejectedValueOnce(new Error("Wrong password"));
    await expect(reauthenticateMobileMfa("old-session", "test-only")).rejects.toThrow(
      "Wrong password",
    );
    expect(setSession).not.toHaveBeenCalled();
    request.mockResolvedValue({ access_token: "new-session", refresh_token: "test-refresh" });
    setSession.mockResolvedValue({ error: null });
    await reauthenticateMobileMfa("old-session", "test-only");
    expect(setSession).toHaveBeenCalledWith({
      access_token: "new-session",
      refresh_token: "test-refresh",
    });
  });

  it("sends the exact token and distinguishes cleanup from removal", async () => {
    await enrollMobileMfa("password-session");
    await removeMobileMfa("promoted-session", "factor-1");
    await removeMobileMfa("promoted-session", "factor-1", true);
    expect(request.mock.calls.map(([, token, init]) => [token, JSON.parse(init.body)])).toEqual([
      ["password-session", { action: "enroll" }],
      ["promoted-session", { action: "remove", factorId: "factor-1" }],
      ["promoted-session", { action: "cleanup", factorId: "factor-1" }],
    ]);
  });

  it("bounds provider calls and ignores late settlement without replaying", async () => {
    vi.useFakeTimers();
    let resolve!: (value: string) => void;
    const provider = new Promise<string>((done) => {
      resolve = done;
    });
    const result = withMfaDeadline(provider);
    const assertion = expect(result).rejects.toBeInstanceOf(MfaRequestTimeoutError);
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    resolve("late-session");
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
