import { describe, expect, it } from "vitest";
import { resolveToastDuration, TOAST_ACTION_MIN_DURATION_MS } from "./toast-timing";

describe("resolveToastDuration", () => {
  it("gives each tone its own default", () => {
    expect(resolveToastDuration("success")).toBe(4000);
    expect(resolveToastDuration("info")).toBe(5000);
    expect(resolveToastDuration("warning")).toBe(7000);
    expect(resolveToastDuration("error")).toBe(8000);
  });

  it("keeps a toast with an action up for at least the floor", () => {
    expect(resolveToastDuration("success", { hasAction: true })).toBe(TOAST_ACTION_MIN_DURATION_MS);
    expect(resolveToastDuration("info", { hasAction: true })).toBe(8000);
    expect(resolveToastDuration("error", { hasAction: true })).toBe(8000);
  });
});
