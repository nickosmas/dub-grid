import { describe, expect, it } from "vitest";
import { withToastDuration } from "./toast-duration";

describe("withToastDuration", () => {
  it("gives each tone its default", () => {
    expect(withToastDuration("success")?.duration).toBe(4000);
    expect(withToastDuration("info")?.duration).toBe(5000);
    expect(withToastDuration("warning")?.duration).toBe(7000);
    expect(withToastDuration("error", { description: "Try again." })).toEqual({
      description: "Try again.",
      duration: 8000,
    });
  });

  it("keeps a toast with an action up at least 8s", () => {
    const action = { label: "Undo", onClick: () => {} };
    expect(withToastDuration("success", { action })?.duration).toBe(8000);
  });

  it("keeps an explicit duration, Infinity included", () => {
    expect(withToastDuration("error", { duration: 6000 })?.duration).toBe(6000);
    expect(withToastDuration("error", { duration: Infinity })?.duration).toBe(Infinity);
  });

  it("leaves loading and plain toasts to Sonner", () => {
    expect(withToastDuration("loading")).toBeUndefined();
    expect(withToastDuration("message", { id: "a" })).toEqual({ id: "a" });
  });
});
