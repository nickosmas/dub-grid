import { describe, expect, it } from "vitest";
import { retryAfterSeconds } from "./retry-after";

describe("retryAfterSeconds", () => {
  // A realistic epoch, so dividing `reset` alone would be caught: it reports
  // about 1.79 billion seconds rather than the remaining window.
  const NOW = 1_790_000_000_000;

  it("reports the time left in the window, not the window's epoch", () => {
    expect(retryAfterSeconds(NOW + 45_000, NOW)).toBe(45);
  });

  it("rounds a partial second up so a client never retries early", () => {
    expect(retryAfterSeconds(NOW + 1_500, NOW)).toBe(2);
  });

  it("never advertises zero or a negative wait once the window has passed", () => {
    expect(retryAfterSeconds(NOW - 5_000, NOW)).toBe(1);
  });

  it("falls back to a minute when the limiter reports no reset", () => {
    expect(retryAfterSeconds(undefined, NOW)).toBe(60);
  });
});
