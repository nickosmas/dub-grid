import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MOBILE_AUTH_ACTION_TIMEOUT_MS,
  MobileAuthActionTimeoutError,
  settleMobileAuthAction,
} from "./request-deadline";

describe("settleMobileAuthAction", () => {
  afterEach(() => vi.useRealTimers());

  it("returns a provider result that settles inside the budget", async () => {
    await expect(settleMobileAuthAction(Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("rejects a stalled provider operation at the shared deadline", async () => {
    vi.useFakeTimers();
    const result = settleMobileAuthAction(new Promise(() => undefined));
    const expectation = expect(result).rejects.toBeInstanceOf(MobileAuthActionTimeoutError);

    await vi.advanceTimersByTimeAsync(MOBILE_AUTH_ACTION_TIMEOUT_MS);

    await expectation;
  });
});
