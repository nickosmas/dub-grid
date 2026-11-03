import { describe, expect, it } from "vitest";
import { bannerIconColor, TOAST_ICON_FILL } from "./status-icon";

describe("status icon colours", () => {
  it("gives toasts the bright tone fills", () => {
    expect(TOAST_ICON_FILL).toEqual({
      success: "#16A34A",
      warning: "#F59E0B",
      info: "#2563EB",
      danger: "#DC2626",
    });
  });

  it("gives banners a deeper amber and green in light mode, where the bright ones fade into the tint", () => {
    expect(bannerIconColor("warning", "light")).toBe("#D97706");
    expect(bannerIconColor("success", "light")).toBe("#15803D");
    expect(bannerIconColor("danger", "light")).toBe("#DC2626");
    expect(bannerIconColor("info", "light")).toBe("#2563EB");
  });

  it("gives banners brighter colours on the dark tints", () => {
    expect(bannerIconColor("warning", "dark")).toBe("#FBBF24");
    expect(bannerIconColor("success", "dark")).toBe("#4ADE80");
    expect(bannerIconColor("danger", "dark")).toBe("#F87171");
    expect(bannerIconColor("info", "dark")).toBe("#60A5FA");
  });
});
