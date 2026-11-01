import { describe, expect, it } from "vitest";
import { barActionIsCheckmark } from "./bar-action";

describe("barActionIsCheckmark", () => {
  it("draws a plain save as a checkmark", () => {
    for (const label of ["Save", "Save changes", "Save access", "Done", "Update", "Confirm"]) {
      expect(barActionIsCheckmark(label)).toBe(true);
    }
  });

  it("keeps the words of a verb with its own outcome", () => {
    for (const label of [
      "Send",
      "Send invitation",
      "Clear all",
      "Add person",
      "Submit",
      "Continue",
      "Approve",
      "Reject",
      "Mark away",
      "Finish",
      "Update and sign out",
    ]) {
      expect(barActionIsCheckmark(label)).toBe(false);
    }
  });

  it("keeps words when there is no label", () => {
    expect(barActionIsCheckmark(undefined)).toBe(false);
  });
});
