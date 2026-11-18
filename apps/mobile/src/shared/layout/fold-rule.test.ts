import { describe, expect, it } from "vitest";
import { shouldPushPickOnClose, shouldReturnToSplit } from "./fold-rule";

describe("shouldPushPickOnClose", () => {
  it("pushes the row the person picked when the split closes", () => {
    expect(shouldPushPickOnClose({ wasSplit: true, isSplit: false, pickedId: "p1" })).toBe(true);
  });

  it("lets a default the page chose give way to the list", () => {
    expect(shouldPushPickOnClose({ wasSplit: true, isSplit: false, pickedId: null })).toBe(false);
  });

  it("does nothing unless the split is closing", () => {
    expect(shouldPushPickOnClose({ wasSplit: false, isSplit: false, pickedId: "p1" })).toBe(false);
    expect(shouldPushPickOnClose({ wasSplit: false, isSplit: true, pickedId: "p1" })).toBe(false);
    expect(shouldPushPickOnClose({ wasSplit: true, isSplit: true, pickedId: "p1" })).toBe(false);
  });
});

describe("shouldReturnToSplit", () => {
  it("returns a page the fold pushed once the split opens", () => {
    expect(shouldReturnToSplit({ isSplit: true, pushedByFold: true })).toBe(true);
  });

  it("leaves a page opened any other way where it is", () => {
    expect(shouldReturnToSplit({ isSplit: true, pushedByFold: false })).toBe(false);
    expect(shouldReturnToSplit({ isSplit: false, pushedByFold: true })).toBe(false);
  });
});
