import { beforeEach, describe, expect, it } from "vitest";
import {
  getVisibleSheetCount,
  resetSheetPresentationTracking,
  trackSheetPresentation,
} from "./modal-presentation";

describe("sheet presentation tracking", () => {
  beforeEach(() => {
    resetSheetPresentationTracking();
  });

  it("allows a confirmation layered over the sheet it guards", () => {
    expect(() => {
      trackSheetPresentation("show", "Edit management access");
      trackSheetPresentation("show", "Discard unsaved changes?");
    }).not.toThrow();
    expect(getVisibleSheetCount()).toBe(2);
  });

  it("rejects a third sheet and names the stack that produced it", () => {
    trackSheetPresentation("show", "Edit management access");
    trackSheetPresentation("show", "Discard unsaved changes?");

    expect(() => trackSheetPresentation("show", "App access")).toThrow(
      /Edit management access > Discard unsaved changes\? > App access/,
    );
  });

  it("frees the slot again once a sheet closes", () => {
    trackSheetPresentation("show", "Edit management access");
    trackSheetPresentation("show", "Discard unsaved changes?");
    trackSheetPresentation("hide", "Discard unsaved changes?");

    expect(() => trackSheetPresentation("show", "App access")).not.toThrow();
    expect(getVisibleSheetCount()).toBe(2);
  });

  // Sheets do not always close in the order they opened: a screen can dismiss
  // the one underneath while a confirmation is still up.
  it("removes the sheet that actually closed, not the most recent one", () => {
    trackSheetPresentation("show", "Edit management access");
    trackSheetPresentation("show", "Discard unsaved changes?");
    trackSheetPresentation("hide", "Edit management access");

    expect(() => trackSheetPresentation("show", "App access")).not.toThrow();
  });

  // An unbalanced hide would otherwise drive the count negative and hand a
  // screen extra headroom before the limit bites.
  it("never counts below zero", () => {
    trackSheetPresentation("hide", "Never shown");
    trackSheetPresentation("hide", "Never shown either");

    expect(getVisibleSheetCount()).toBe(0);
  });
});
