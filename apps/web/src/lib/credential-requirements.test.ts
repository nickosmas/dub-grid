import { describe, expect, it } from "vitest";
import {
  describeCertificationRequirement,
  satisfiesCertificationRequirement,
} from "./credential-requirements";

const certifications = new Map([
  [1, { id: 1, name: "Christian Science Nurse II", abbr: "CSN II" }],
  [2, { id: 2, name: "Christian Science Nurse III", abbr: "CSN III" }],
]);

describe("role certification requirements", () => {
  it("allows anyone when no certification is required", () => {
    expect(satisfiesCertificationRequirement({ heldIds: [null], requiredIds: [] })).toBe(true);
  });

  it("requires membership in the configured certification set", () => {
    expect(satisfiesCertificationRequirement({ heldIds: [2], requiredIds: [1, 2] })).toBe(true);
    expect(satisfiesCertificationRequirement({ heldIds: [3], requiredIds: [1, 2] })).toBe(false);
  });

  it("uses the configured certification names in feedback", () => {
    expect(
      describeCertificationRequirement({ requiredIds: [1, 2], itemsById: certifications }),
    ).toBe("CSN II or CSN III");
  });
});
