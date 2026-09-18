import { describe, expect, it } from "vitest";
import { STARTUP_STATUS_DELAY_MS, STARTUP_SURFACE_DELAY_MS, STARTUP_TIMEOUT_MS } from "./startup";

describe("startup timing", () => {
  it("asks for an explanation before it offers a way out", () => {
    expect(STARTUP_STATUS_DELAY_MS).toBeLessThan(STARTUP_TIMEOUT_MS);
  });

  it("keeps status copy inside the 2-3s band the feature specifies", () => {
    expect(STARTUP_STATUS_DELAY_MS).toBeGreaterThanOrEqual(2_000);
    expect(STARTUP_STATUS_DELAY_MS).toBeLessThanOrEqual(3_000);
  });

  it("paints a startup surface only once a wait stops being a flicker", () => {
    expect(STARTUP_SURFACE_DELAY_MS).toBeGreaterThan(0);
    expect(STARTUP_SURFACE_DELAY_MS).toBeLessThan(STARTUP_STATUS_DELAY_MS);
  });

  it("keeps the timeout inside the 8-10s band the feature specifies", () => {
    expect(STARTUP_TIMEOUT_MS).toBeGreaterThanOrEqual(8_000);
    expect(STARTUP_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });
});
