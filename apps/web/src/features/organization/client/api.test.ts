import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestTimeoutError } from "@/lib/fetch-with-timeout";

const fetchWithTimeout = vi.fn();

vi.mock("@/lib/fetch-with-timeout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fetch-with-timeout")>();
  return { ...actual, fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args) };
});

import { fetchOrganizationBootstrap, isRetryableOrganizationBootstrapError } from "./api";

describe("organization bootstrap client", () => {
  beforeEach(() => {
    fetchWithTimeout.mockReset();
  });

  it("uses a five-second deadline while preserving React Query's abort signal", async () => {
    const controller = new AbortController();
    fetchWithTimeout.mockResolvedValue(
      new Response(JSON.stringify({ org: null }), {
        headers: { "content-type": "application/json" },
      }),
    );

    await fetchOrganizationBootstrap(controller.signal);

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/organization\/bootstrap$/),
      { signal: controller.signal },
      5_000,
    );
  });

  it("retries a typed request timeout", () => {
    expect(isRetryableOrganizationBootstrapError(new RequestTimeoutError(5_000))).toBe(true);
  });
});
