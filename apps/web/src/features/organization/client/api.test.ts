import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestTimeoutError } from "@/lib/fetch-with-timeout";

const fetchWithTimeout = vi.fn();

vi.mock("@/lib/fetch-with-timeout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fetch-with-timeout")>();
  return { ...actual, fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args) };
});

import {
  getOrganizationBootstrapQueryPolicy,
  fetchOrganizationBootstrap,
  isRetryableOrganizationBootstrapError,
  OrganizationRequestError,
} from "./api";

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

  it("gives every bootstrap observer the same bounded query policy", () => {
    const policy = getOrganizationBootstrapQueryPolicy();
    const retryableError = new OrganizationRequestError("Temporary failure", 503, null);

    expect(policy.staleTime).toBe(5 * 60_000);
    expect(policy.retry(2, retryableError)).toBe(true);
    expect(policy.retry(3, retryableError)).toBe(false);
    expect(policy.retry(0, new OrganizationRequestError("Rejected", 400, null))).toBe(false);
    expect(policy.retryOnMount).toBe(false);
  });
});
