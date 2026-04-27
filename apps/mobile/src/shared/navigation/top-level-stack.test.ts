import { describe, expect, it } from "vitest";
import {
  commonStackOptions,
  createDetailStackOptions,
  createTopLevelStackOptions,
} from "./top-level-stack";

describe("top-level stack options", () => {
  it("uses icon-only back buttons so iOS does not show route labels", () => {
    expect(commonStackOptions).toMatchObject({
      headerBackButtonDisplayMode: "minimal",
      headerBackVisible: true,
    });
    expect(createDetailStackOptions("Shift Detail")).toMatchObject({
      headerBackButtonDisplayMode: "minimal",
      headerBackVisible: true,
    });
    expect(createTopLevelStackOptions("Schedule")).toMatchObject({
      headerBackButtonDisplayMode: "minimal",
      headerBackVisible: true,
    });
  });
});
