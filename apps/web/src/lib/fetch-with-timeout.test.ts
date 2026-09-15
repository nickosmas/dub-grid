import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchWithTimeout,
  RequestTimeoutError,
  settleWithRequestTimeout,
} from "./fetch-with-timeout";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchWithTimeout", () => {
  it("rejects a stalled request with a typed timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("timed out", "TimeoutError")),
              { once: true },
            );
          }),
      ),
    );

    await expect(fetchWithTimeout("/bootstrap", {}, 20)).rejects.toBeInstanceOf(
      RequestTimeoutError,
    );
  });

  it("preserves caller cancellation instead of recasting it as a timeout", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("cancelled", "AbortError")),
              { once: true },
            );
          }),
      ),
    );

    const request = fetchWithTimeout("/bootstrap", { signal: controller.signal }, 1_000);
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("settleWithRequestTimeout", () => {
  it("returns a provider result that settles before its deadline", async () => {
    await expect(settleWithRequestTimeout(Promise.resolve("ready"), 20)).resolves.toBe("ready");
  });

  it("rejects stalled provider work at its owned deadline", async () => {
    vi.useFakeTimers();
    const request = settleWithRequestTimeout(new Promise(() => {}), 20);
    const assertion = expect(request).rejects.toBeInstanceOf(RequestTimeoutError);

    await vi.advanceTimersByTimeAsync(20);
    await assertion;
  });
});
