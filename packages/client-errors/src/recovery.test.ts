import { describe, expect, it, vi } from "vitest";
import {
  AUTH_RECOVERY_MAX_AUTOMATIC_RETRIES,
  createAuthRecoverySingleFlight,
  getAuthRecoveryRetryAfterMs,
  getAuthRecoveryRetryDelay,
  isAuthRecoveryCancellation,
  isRetryableAuthRecoveryError,
  mayHavePasswordUpdateCommitted,
  parseRetryAfterMs,
  shouldRetryAuthRecovery,
} from "./index";

describe("authentication recovery classification", () => {
  it.each([408, 429, 500, 503, 599])("retries HTTP %i", (status) => {
    expect(isRetryableAuthRecoveryError({ status })).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])("does not retry terminal HTTP %i", (status) => {
    expect(isRetryableAuthRecoveryError({ status })).toBe(false);
  });

  it("retries network and deadline failures", () => {
    expect(isRetryableAuthRecoveryError(new TypeError("Failed to fetch"))).toBe(true);
    expect(
      isRetryableAuthRecoveryError(Object.assign(new Error("late"), { name: "TimeoutError" })),
    ).toBe(true);
    expect(
      isRetryableAuthRecoveryError(
        Object.assign(new Error("Request exceeded 5000ms"), { name: "RequestTimeoutError" }),
      ),
    ).toBe(true);
  });

  it("keeps caller cancellation distinct from a retryable timeout", () => {
    const cancellation = Object.assign(new Error("cancelled"), { name: "AbortError" });

    expect(isAuthRecoveryCancellation(cancellation)).toBe(true);
    expect(isRetryableAuthRecoveryError(cancellation)).toBe(false);
  });

  it("stops after the finite automatic retry budget", () => {
    const error = { status: 503 };

    expect(shouldRetryAuthRecovery(0, error)).toBe(true);
    expect(shouldRetryAuthRecovery(AUTH_RECOVERY_MAX_AUTOMATIC_RETRIES - 1, error)).toBe(true);
    expect(shouldRetryAuthRecovery(AUTH_RECOVERY_MAX_AUTOMATIC_RETRIES, error)).toBe(false);
  });
});

describe("authentication recovery delay", () => {
  it("parses delta seconds and HTTP dates", () => {
    const nowMs = Date.parse("2026-09-08T12:00:00.000Z");

    expect(parseRetryAfterMs("12", nowMs)).toBe(12_000);
    expect(parseRetryAfterMs("Tue, 08 Sep 2026 12:00:20 GMT", nowMs)).toBe(20_000);
  });

  it.each([null, undefined, "", "1.5", "not-a-date"])(
    "rejects malformed Retry-After value %s",
    (value) => {
      expect(parseRetryAfterMs(value)).toBeNull();
    },
  );

  it("reads both web milliseconds and API-client header metadata", () => {
    expect(getAuthRecoveryRetryAfterMs({ retryAfterMs: 2_500 })).toBe(2_500);
    expect(getAuthRecoveryRetryAfterMs({ retryAfter: "4" })).toBe(4_000);
  });

  it("applies capped jitter and never retries before Retry-After", () => {
    expect(
      getAuthRecoveryRetryDelay({ status: 503 }, 10, {
        baseDelayMs: 1_000,
        maxDelayMs: 30_000,
        random: () => 1,
      }),
    ).toBe(30_000);
    expect(
      getAuthRecoveryRetryDelay({ status: 429, retryAfter: "45" }, 0, {
        random: () => 0,
      }),
    ).toBe(45_000);
  });
});

describe("authentication recovery single flight", () => {
  it("coalesces concurrent triggers and permits a new attempt after success", async () => {
    let resolveAttempt: ((value: string) => void) | undefined;
    const attempt = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveAttempt = resolve;
        }),
    );
    const run = createAuthRecoverySingleFlight(attempt);

    const first = run();
    const duplicate = run();
    expect(duplicate).toBe(first);
    expect(attempt).toHaveBeenCalledTimes(1);

    resolveAttempt?.("done");
    await expect(first).resolves.toBe("done");
    await Promise.resolve();

    const next = run();
    expect(attempt).toHaveBeenCalledTimes(2);
    resolveAttempt?.("again");
    await expect(next).resolves.toBe("again");
  });

  it("releases the guard after a rejected attempt", async () => {
    const attempt = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const run = createAuthRecoverySingleFlight(attempt);

    await expect(run()).rejects.toThrow("offline");
    await expect(run()).resolves.toBeUndefined();
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});

describe("mayHavePasswordUpdateCommitted", () => {
  it("treats a deadline, a lost response and a provider failure as possibly applied", () => {
    expect(mayHavePasswordUpdateCommitted({ name: "RequestTimeoutError" })).toBe(true);
    expect(mayHavePasswordUpdateCommitted(new TypeError("Network request failed"))).toBe(true);
    expect(mayHavePasswordUpdateCommitted({ name: "AuthRetryableFetchError", status: 0 })).toBe(
      true,
    );
    expect(mayHavePasswordUpdateCommitted({ code: "unexpected_failure", status: 500 })).toBe(true);
  });

  it("treats a definite rejection or a cancellation as nothing changed", () => {
    expect(mayHavePasswordUpdateCommitted({ code: "same_password", status: 422 })).toBe(false);
    expect(mayHavePasswordUpdateCommitted({ code: "weak_password", status: 422 })).toBe(false);
    expect(mayHavePasswordUpdateCommitted({ code: "session_expired", status: 401 })).toBe(false);
    expect(mayHavePasswordUpdateCommitted({ code: "same_password" })).toBe(false);
    expect(mayHavePasswordUpdateCommitted({ name: "AbortError" })).toBe(false);
  });
});
