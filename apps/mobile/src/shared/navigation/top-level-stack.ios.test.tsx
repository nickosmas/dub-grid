import { beforeAll, describe, expect, it, vi } from "vitest";

// The shared suite runs under the react-native-web shim, where `Platform.OS` is
// "web" and the large-title branch is never taken. These assertions are about
// that branch specifically, so this file pins the platform to iOS.
vi.mock("react-native", () => ({
  Platform: {
    OS: "ios",
    select: (value: Record<string, unknown>) => value.ios ?? value.default ?? null,
  },
}));

let createTopLevelStackOptions: (typeof import("./top-level-stack"))["createTopLevelStackOptions"];
let createDetailStackOptions: (typeof import("./top-level-stack"))["createDetailStackOptions"];
let mobileColors: (typeof import("../theme/tokens"))["mobileColors"];

beforeAll(async () => {
  ({ createTopLevelStackOptions, createDetailStackOptions } = await import("./top-level-stack"));
  ({ mobileColors } = await import("../theme/tokens"));
});

describe("top-level stack options on iOS", () => {
  it("asks UIKit for the native large title", () => {
    expect(createTopLevelStackOptions(mobileColors, "People")).toMatchObject({
      title: "People",
      headerLargeTitle: true,
      headerLargeTitleEnabled: true,
    });
  });

  /**
   * A large-title header must carry no background of its own, and the two ways
   * of giving it one each break something different:
   *
   * - an explicit `headerStyle`/`headerLargeStyle` background makes the title
   *   invisible on iOS 26, which is why react-navigation resolves
   *   `headerBackgroundColor` to transparent for these headers unless something
   *   overrides it — and the common opaque `headerStyle` was overriding it;
   * - `headerBackground` makes the header translucent and absolutely
   *   positioned, which costs the collapse: the title shows but stops shrinking
   *   into the bar on scroll.
   *
   * Transparent is what the page wants anyway — `Screen`'s scroll view is
   * painted with `background` and scrolls under the bar, so the color showing
   * through is the page's own.
   */
  it("carries no header background of any kind", () => {
    const options = createTopLevelStackOptions(mobileColors, "People");

    expect(options.headerStyle).toBeUndefined();
    expect(options).not.toHaveProperty("headerLargeStyle");
    expect(options.headerBackground).toBeUndefined();
  });

  // A screen that stays on the inline title keeps the opaque header, which is
  // both safe there and what keeps its title off a seam.
  it("keeps the opaque header on a screen with no large title", () => {
    const options = createDetailStackOptions(mobileColors, "Shift Detail");

    expect(options.headerLargeTitleEnabled).toBe(false);
    expect(options.headerStyle).toMatchObject({ backgroundColor: mobileColors.background });
  });

  // The People and Profile sections take large titles at every level, so their
  // pushed screens opt in — and then they have to follow the same
  // no-background rule as the tab roots, or they lose the title to the iOS 26
  // bug above.
  it("gives an opted-in pushed screen the same backgroundless large title", () => {
    const options = createDetailStackOptions(mobileColors, "Person", { largeTitle: true });

    expect(options).toMatchObject({
      headerLargeTitle: true,
      headerLargeTitleEnabled: true,
      // Kept: a pushed screen still wants the full-width back swipe.
      fullScreenGestureEnabled: true,
    });
    expect(options.headerStyle).toBeUndefined();
    // Never both: a transparent bar is what costs a large title its collapse.
    expect(options.headerTransparent).toBeUndefined();
    expect(options.headerBlurEffect).toBeUndefined();
  });
});
