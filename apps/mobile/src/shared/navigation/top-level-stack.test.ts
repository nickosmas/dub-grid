import { describe, expect, it, vi } from "vitest";
import { mobileColors } from "../theme/tokens";

// `HeaderBackButton` pulls in expo-router, which ships untranspiled TSX.
vi.mock("expo-router", () => ({ router: {} }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));
import {
  createCommonStackOptions,
  createDetailStackOptions,
  createTopLevelStackOptions,
} from "./top-level-stack";

describe("top-level stack options", () => {
  it("uses icon-only back buttons so iOS does not show route labels", () => {
    expect(createCommonStackOptions(mobileColors)).toMatchObject({
      headerBackButtonDisplayMode: "minimal",
      headerBackVisible: true,
    });
    expect(createDetailStackOptions(mobileColors, "Shift Detail")).toMatchObject({
      headerBackButtonDisplayMode: "minimal",
      headerBackVisible: true,
      headerLargeTitle: false,
      headerLargeTitleEnabled: false,
    });
    expect(createTopLevelStackOptions(mobileColors, "Schedule")).toMatchObject({
      headerBackButtonDisplayMode: "minimal",
      headerBackVisible: true,
      headerLargeTitle: expect.any(Boolean),
      headerLargeTitleEnabled: expect.any(Boolean),
    });
  });

  // This suite runs under the react-native-web shim, so `Platform.OS` is "web"
  // and this is the non-large-title branch, where an opaque `headerStyle` is
  // both safe and what keeps the header off the navigation theme's `card`
  // (white) above a page sitting on `background`. The iOS branch deliberately
  // does NOT paint `headerStyle` — an explicit background there makes an iOS 26
  // large title invisible — and is covered in top-level-stack.ios.test.tsx.
  // Don't "fix" that branch by pushing this background back onto it.
  it("paints the header with the page's own background where there is no large title", () => {
    const options = createTopLevelStackOptions(mobileColors, "Profile");

    expect(options.headerLargeTitleEnabled).toBe(false);
    expect(options.headerStyle).toMatchObject({
      backgroundColor: mobileColors.background,
    });
    // The header and the page it sits over are one continuous surface, so the
    // bar has to take the page's colour rather than `surface`. That used to be
    // visible as a colour difference; now that the light page is white it is
    // only visible if the two tokens are read from the same place, which is
    // exactly what this pins. The content style has to agree, or the header
    // and the page under it split into two shades on any future theme change.
    expect(options.contentStyle).toMatchObject({
      backgroundColor: mobileColors.background,
    });
  });
});
