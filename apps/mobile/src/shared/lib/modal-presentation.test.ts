import { beforeEach, describe, expect, it } from "vitest";
import {
  getVisibleSheetCount,
  resetSheetPresentationTracking,
  registerModalPresentation,
} from "./modal-presentation";

describe("modal presentation policy", () => {
  beforeEach(resetSheetPresentationTracking);

  it("allows one task with one confirmation", () => {
    registerModalPresentation("sheet", "Edit access");
    expect(() => registerModalPresentation("confirmation", "Discard edits?")).not.toThrow();
    expect(getVisibleSheetCount()).toBe(1);
  });

  it.each(["sheet", "confirmation"] as const)("rejects a second %s", (kind) => {
    registerModalPresentation(kind, "First");
    expect(() => registerModalPresentation(kind, "Second")).toThrow(`Only one ${kind}`);
  });

  it("allows a required gate to interrupt a task and its confirmation", () => {
    registerModalPresentation("sheet", "Edit access");
    registerModalPresentation("confirmation", "Discard edits?");
    expect(() => registerModalPresentation("gate", "Unlock")).not.toThrow();
  });

  it("releases the exact surface, even when labels match or cleanup repeats", () => {
    const closeSheet = registerModalPresentation("sheet", "Access");
    const closeConfirmation = registerModalPresentation("confirmation", "Access");
    closeSheet();
    closeSheet();
    expect(getVisibleSheetCount()).toBe(0);
    expect(() => registerModalPresentation("confirmation", "Other")).toThrow();
    closeConfirmation();
    expect(() => registerModalPresentation("sheet", "Next task")).not.toThrow();
  });
});
