import { describe, expect, it } from "vitest";
import { correctionReasonLabel } from "./schedule-corrections";

describe("correctionReasonLabel", () => {
  it("passes a typed reason through", () => {
    expect(correctionReasonLabel("Sent home sick at 10")).toBe("Sent home sick at 10");
  });

  it("reads a reason stored as a key before reasons were typed", () => {
    expect(correctionReasonLabel("swapped")).toBe("Swapped with someone");
  });
});
