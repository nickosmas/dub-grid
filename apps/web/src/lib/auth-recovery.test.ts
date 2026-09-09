import { describe, expect, it } from "vitest";
import { RequestTimeoutError } from "./fetch-with-timeout";
import { getWebAuthRecoveryMessage } from "./auth-recovery";

describe("getWebAuthRecoveryMessage", () => {
  it("uses safe actionable copy for retryable failures", () => {
    expect(getWebAuthRecoveryMessage({ status: 429 }, "fallback")).toBe(
      "Too many requests. Wait a few minutes and try again.",
    );
    expect(getWebAuthRecoveryMessage(new RequestTimeoutError(15_000), "fallback")).toBe(
      "That took too long. Check your connection and try again.",
    );
    expect(getWebAuthRecoveryMessage(new TypeError("Failed to fetch"), "fallback")).toBe(
      "We couldn't reach DubGrid. Check your connection and try again.",
    );
    expect(getWebAuthRecoveryMessage({ status: 503 }, "fallback")).toBe(
      "DubGrid is temporarily unavailable. Please try again.",
    );
  });

  it("keeps terminal failures on the caller's specific fallback", () => {
    expect(getWebAuthRecoveryMessage({ status: 401 }, "Check your credentials.")).toBe(
      "Check your credentials.",
    );
  });
});
