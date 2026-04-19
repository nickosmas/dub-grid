import { describe, expect, it } from "vitest";
import { shouldShowScheduleEditorNames } from "@/app/schedule/_lib/editor-visibility";

describe("shouldShowScheduleEditorNames", () => {
  it("hides editor names when there is only one distinct user online", () => {
    expect(shouldShowScheduleEditorNames([], "user-1")).toBe(false);
    expect(
      shouldShowScheduleEditorNames([{ userId: "user-1" }], "user-1"),
    ).toBe(false);
  });

  it("shows editor names when the current user and another user are online", () => {
    expect(
      shouldShowScheduleEditorNames([{ userId: "user-2" }], "user-1"),
    ).toBe(true);
  });

  it("shows editor names when two remote users are online", () => {
    expect(
      shouldShowScheduleEditorNames([{ userId: "user-2" }, { userId: "user-3" }]),
    ).toBe(true);
  });
});
