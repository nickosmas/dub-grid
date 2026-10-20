import { describe, expect, it } from "vitest";
import { scheduleCellStateSchema } from "./schedule";

const segment = { shiftId: 1, jobId: 10, position: 0 };

describe("scheduleCellStateSchema", () => {
  it("accepts a worked cell with an off day for the rest of the day (item 45)", () => {
    const parsed = scheduleCellStateSchema.safeParse({
      kind: "worked",
      segments: [segment],
      absenceTypeId: 7,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ kind: "worked", absenceTypeId: 7 });
  });

  it("still refuses a worked cell with no segments, even with an off day", () => {
    expect(
      scheduleCellStateSchema.safeParse({ kind: "worked", segments: [], absenceTypeId: 7 }).success,
    ).toBe(false);
  });

  it("still refuses a whole-day absence with segments", () => {
    expect(
      scheduleCellStateSchema.safeParse({ kind: "absence", segments: [segment], absenceTypeId: 7 })
        .success,
    ).toBe(false);
  });

  it("still refuses a deleted cell with an absence type", () => {
    expect(
      scheduleCellStateSchema.safeParse({ kind: "deleted", segments: [], absenceTypeId: 7 })
        .success,
    ).toBe(false);
  });
});
