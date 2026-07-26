import { describe, expect, it } from "vitest";
import { isManagementOnly, isOnSchedule } from "./employmentStatus";

describe("isOnSchedule", () => {
  it("is true when the employee has at least one focus area", () => {
    expect(isOnSchedule([1])).toBe(true);
  });

  it("is false when the employee has no focus areas", () => {
    expect(isOnSchedule([])).toBe(false);
  });
});

describe("isManagementOnly", () => {
  it("is true when the employee has department access but no focus areas", () => {
    expect(isManagementOnly([], [1])).toBe(true);
  });

  it("is false when the employee is also on schedule", () => {
    expect(isManagementOnly([1], [1])).toBe(false);
  });

  it("is false when the employee has no department access", () => {
    expect(isManagementOnly([], [])).toBe(false);
  });
});
