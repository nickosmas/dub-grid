import { describe, expect, it } from "vitest";
import { satisfiesCertificationRequirement } from "./credential-requirements";

describe("satisfiesCertificationRequirement", () => {
  it("allows unrestricted roles", () => {
    expect(satisfiesCertificationRequirement({ heldIds: [null], requiredIds: [] })).toBe(true);
  });

  it("accepts any matching certification", () => {
    expect(satisfiesCertificationRequirement({ heldIds: [2], requiredIds: [1, 2] })).toBe(true);
  });

  it("rejects missing or non-matching certifications", () => {
    expect(satisfiesCertificationRequirement({ heldIds: [null], requiredIds: [1] })).toBe(false);
    expect(satisfiesCertificationRequirement({ heldIds: [3], requiredIds: [1, 2] })).toBe(false);
  });

  it("keeps all named certifications distinct from unrestricted Anyone access", () => {
    expect(satisfiesCertificationRequirement({ heldIds: [null], requiredIds: [1, 2] })).toBe(false);
    expect(satisfiesCertificationRequirement({ heldIds: [null], requiredIds: [] })).toBe(true);
  });
});
