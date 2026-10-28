import { describe, expect, it } from "vitest";
import {
  CORRECTION_REASON_KEYS,
  correctionNeedsNote,
  correctionReasonLabel,
} from "./schedule-corrections";

describe("correction reasons", () => {
  it("are the keys the database accepts, in the panel's order", () => {
    expect(CORRECTION_REASON_KEYS).toEqual([
      "called_off",
      "left_early",
      "swapped",
      "wrong_shift",
      "other",
    ]);
  });

  it("label each key and pass an unknown one through", () => {
    expect(correctionReasonLabel("swapped")).toBe("Swapped with someone");
    expect(correctionReasonLabel("legacy")).toBe("legacy");
  });

  it("need a note only for Other", () => {
    expect(correctionNeedsNote("other")).toBe(true);
    expect(correctionNeedsNote("called_off")).toBe(false);
  });
});
