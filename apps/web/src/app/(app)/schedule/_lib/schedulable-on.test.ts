import { describe, expect, it } from "vitest";
import type { Employee } from "@/types";
import { buildSchedulableOn } from "./schedulable-on";

const person = (overrides: Partial<Employee>) =>
  ({ id: "ana", status: "active", archivedAt: null, ...overrides }) as Employee;

describe("buildSchedulableOn", () => {
  it("refuses a day before today and takes today and later", () => {
    const schedulableOn = buildSchedulableOn([person({})], "2026-10-28");
    expect(schedulableOn("ana", "2026-10-27")).toBe(false);
    expect(schedulableOn("ana", "2026-10-28")).toBe(true);
    expect(schedulableOn("ana", "2026-11-03")).toBe(true);
  });

  it("keeps the database's rule for someone Away, and refuses someone unknown", () => {
    const schedulableOn = buildSchedulableOn(
      [person({ status: "inactive", awayUntil: "2026-11-02" })],
      "2026-10-28",
    );
    expect(schedulableOn("ana", "2026-10-30")).toBe(false);
    expect(schedulableOn("ana", "2026-11-02")).toBe(true);
    expect(schedulableOn("ben", "2026-11-02")).toBe(false);
  });
});
