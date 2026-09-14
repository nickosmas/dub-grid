import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFloatingTabBarClearance } from "./floating-tab-bar-layout";
import { getFooterBottomPadding, getScreenBottomPadding, getScreenGutter } from "./screen-layout";

// Read at call time by `getScreenBottomPadding`, so flipping this between tests
// is enough — no re-import needed.
const platform: { OS: "ios" | "android" } = { OS: "ios" };

vi.mock("react-native", () => ({
  get Platform() {
    return platform;
  },
}));

beforeEach(() => {
  platform.OS = "ios";
});

describe("getScreenBottomPadding", () => {
  it("adds the safe area to each mode's padding", () => {
    expect(getScreenBottomPadding("tabbed", 14)).toBe(86);
    expect(getScreenBottomPadding("stack", 14)).toBe(38);
    expect(getScreenBottomPadding("modal", 14)).toBe(30);
  });

  it("ignores a negative safe area", () => {
    expect(getScreenBottomPadding("stack", -10)).toBe(24);
  });

  // The floating bar is absolutely positioned, so nothing but this padding
  // keeps a screen's last row out from behind it. The flat 72 it used to get
  // was shorter than the bar's own footprint, which left the final control on
  // a page tucked underneath with no scroll left to reveal it.
  it("clears the whole floating tab bar on Android, with room to spare", () => {
    platform.OS = "android";

    for (const safeAreaBottom of [0, 8, 24, 48]) {
      expect(getScreenBottomPadding("tabbed", safeAreaBottom)).toBeGreaterThan(
        getFloatingTabBarClearance(safeAreaBottom),
      );
    }

    // 8pt inset floor + 6pt gap + a 68pt bar + 16pt of breathing room.
    expect(getScreenBottomPadding("tabbed", 0)).toBe(98);
    expect(getScreenBottomPadding("tabbed", 24)).toBe(114);
  });

  it("leaves the stack and modal modes alone on Android", () => {
    platform.OS = "android";

    expect(getScreenBottomPadding("stack", 24)).toBe(48);
    expect(getScreenBottomPadding("modal", 24)).toBe(40);
  });
});

describe("getFooterBottomPadding", () => {
  it("adds a native iOS tab bar when the safe area only reports the home indicator", () => {
    platform.OS = "ios";

    expect(getFooterBottomPadding("tabbed", 34, true)).toBe(99);
    expect(getFooterBottomPadding("stack", 14, true)).toBe(79);
  });

  it("does not double-count a native iOS tab bar already included in the inset", () => {
    platform.OS = "ios";

    expect(getFooterBottomPadding("tabbed", 83, true)).toBe(99);
  });

  it("caps a tab-hidden footer at the home indicator", () => {
    platform.OS = "ios";

    // A screen pushed over the tab bar can still be handed the tab-inflated
    // inset. Nothing sits below this footer but the home indicator, so paying
    // out the full 83 put a tab bar's worth of dead space under the buttons.
    expect(getFooterBottomPadding("stack", 83)).toBe(50);
    expect(getFooterBottomPadding("modal", 83)).toBe(50);
    expect(getFooterBottomPadding("tabbed", 83)).toBe(50);
  });

  it("passes an honest inset straight through, so the cap is a ceiling not a floor", () => {
    platform.OS = "ios";

    expect(getFooterBottomPadding("stack", 34)).toBe(50);
    expect(getFooterBottomPadding("stack", 14)).toBe(30);
    expect(getFooterBottomPadding("stack", 0)).toBe(16);
  });

  it("keeps Android floating-tab clearance unchanged", () => {
    platform.OS = "android";

    expect(getFooterBottomPadding("tabbed", 0, true)).toBe(98);
    expect(getFooterBottomPadding("tabbed", 24, true)).toBe(114);
    expect(getFooterBottomPadding("stack", 24, true)).toBe(40);
  });
});

/**
 * The gutter has to line up with the leading edge of the navigation bar's
 * title, which is the platform's number rather than ours. On the shared 16, the
 * first thing under an iOS large title — a hero's meta row, a row of action
 * buttons — sat a few points to its left.
 */
describe("getScreenGutter", () => {
  it("matches the inset UIKit gives a large title on iOS", () => {
    platform.OS = "ios";

    expect(getScreenGutter()).toBe(20);
  });

  // Material starts its top app bar title at 16, so Android keeps the shared
  // spacing token rather than iOS's number.
  it("keeps the shared gutter on Android", () => {
    platform.OS = "android";

    expect(getScreenGutter()).toBe(16);
  });
});
