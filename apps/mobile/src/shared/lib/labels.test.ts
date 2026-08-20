import { describe, expect, it } from "vitest";
import { singularLabelNoun } from "./labels";

describe("singularLabelNoun", () => {
  it("turns a plural display label into a mid-sentence noun", () => {
    expect(`Select at least one ${singularLabelNoun("Wings")}`).toBe("Select at least one wing");
    expect(singularLabelNoun("Focus Areas")).toBe("focus area");
    expect(singularLabelNoun("Certifications")).toBe("certification");
  });

  it("leaves an already-singular label alone", () => {
    expect(singularLabelNoun("Wing")).toBe("wing");
    expect(singularLabelNoun("Unit")).toBe("unit");
  });

  it("ignores surrounding whitespace and casing", () => {
    expect(singularLabelNoun("  WINGS  ")).toBe("wing");
  });
});
