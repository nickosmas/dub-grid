import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, RequestTimeoutError } from "./fetch-with-timeout";

afterEach(() => {
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
