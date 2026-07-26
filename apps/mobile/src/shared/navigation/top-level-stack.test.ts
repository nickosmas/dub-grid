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
});
