import { describe, expect, it } from "vitest";
import { STARTUP_MIN_SPLASH_MS, STARTUP_STATUS_DELAY_MS, STARTUP_TIMEOUT_MS } from "./startup";

describe("startup timing", () => {
  it("orders the three phases", () => {
    expect(STARTUP_MIN_SPLASH_MS).toBeLessThan(STARTUP_STATUS_DELAY_MS);
    expect(STARTUP_STATUS_DELAY_MS).toBeLessThan(STARTUP_TIMEOUT_MS);
  });

  it("keeps status copy inside the 2-3s band the feature specifies", () => {
    expect(STARTUP_STATUS_DELAY_MS).toBeGreaterThanOrEqual(2_000);
    expect(STARTUP_STATUS_DELAY_MS).toBeLessThanOrEqual(3_000);
  });

  it("keeps the timeout inside the 8-10s band the feature specifies", () => {
    expect(STARTUP_TIMEOUT_MS).toBeGreaterThanOrEqual(8_000);
    expect(STARTUP_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });

  it("holds a resolved splash only long enough to avoid a flicker", () => {
    // The old 900ms floor existed for the animated mark. A static one needs
    // only enough to not tear away mid-paint.
    expect(STARTUP_MIN_SPLASH_MS).toBeLessThanOrEqual(200);
    expect(STARTUP_MIN_SPLASH_MS).toBeGreaterThan(0);
  });
});
