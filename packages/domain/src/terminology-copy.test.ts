import { describe, expect, it } from "vitest";
import { capitalizeFirst, pluralLabelNoun, singularLabelNoun } from "./terminology-copy";

describe("organization label copy", () => {
  it("puts a plural display label into a sentence", () => {
    expect(singularLabelNoun("Wings")).toBe("wing");
    expect(singularLabelNoun(" Focus Areas ")).toBe("focus area");
    expect(pluralLabelNoun("Focus Areas")).toBe("focus areas");
  });

  it("starts a heading with a capital", () => {
    expect(capitalizeFirst(singularLabelNoun("Focus Areas"))).toBe("Focus area");
  });
});
