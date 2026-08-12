import { describe, expect, it } from "vitest";
import { mobileColors } from "../theme/tokens";
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

  // The large-title branch used to leave `headerStyle` unset, which fell
  // through to the navigation theme's `card` — pure white — while the page
  // under it sits on `background`, slate-50. A visible seam on iOS.
  it("paints both header surfaces with the page's own background", () => {
    const options = createTopLevelStackOptions(mobileColors, "Profile");

    expect(options.headerStyle).toMatchObject({
      backgroundColor: mobileColors.background,
    });
    expect(options.headerLargeStyle).toMatchObject({
      backgroundColor: mobileColors.background,
    });
    expect(mobileColors.background).not.toBe(mobileColors.surface);
  });
});
