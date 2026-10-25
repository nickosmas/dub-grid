import { describe, expect, it } from "vitest";
import { resolvedSchedulePresentationSchema, scheduleCellStateSchema } from "./schedule";

const segment = { shiftId: 1, jobId: 10, position: 0 };

describe("scheduleCellStateSchema", () => {
  it("accepts a worked cell with an absence for the rest of the day (item 45)", () => {
    const parsed = scheduleCellStateSchema.safeParse({
      kind: "worked",
      segments: [segment],
      absenceTypeId: 7,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ kind: "worked", absenceTypeId: 7 });
  });

  it("accepts the time an absence beside a shift covers (item 50b)", () => {
    const parsed = scheduleCellStateSchema.safeParse({
      kind: "worked",
      segments: [segment],
      absenceTypeId: 7,
      absenceStartTime: "07:00",
      absenceEndTime: "11:00",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ absenceStartTime: "07:00", absenceEndTime: "11:00" });
  });

  it("refuses absence times without an absence beside a shift, or only one of them", () => {
    const times = { absenceStartTime: "07:00", absenceEndTime: "11:00" };
    expect(
      scheduleCellStateSchema.safeParse({ kind: "worked", segments: [segment], ...times }).success,
    ).toBe(false);
    expect(
      scheduleCellStateSchema.safeParse({ kind: "absence", absenceTypeId: 7, ...times }).success,
    ).toBe(false);
    expect(
      scheduleCellStateSchema.safeParse({
        kind: "worked",
        segments: [segment],
        absenceTypeId: 7,
        absenceStartTime: "07:00",
      }).success,
    ).toBe(false);
  });

  it("still refuses a worked cell with no segments, even with an absence", () => {
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

describe("resolvedSchedulePresentationSchema", () => {
  const base = { label: "D", startTime: "07:00", endTime: "15:00", segments: [] };
  const sick = {
    absenceTypeId: 8,
    label: "S",
    name: "Sick",
    color: "#fee2e2",
    borderColor: "#fca5a5",
    textColor: "#991b1b",
  };

  it("accepts an absence for the rest of the day, none, or a payload from before item 45", () => {
    expect(
      resolvedSchedulePresentationSchema.parse({ ...base, restOfDayAbsence: sick }),
    ).toMatchObject({
      restOfDayAbsence: sick,
    });
    expect(
      resolvedSchedulePresentationSchema.parse({ ...base, restOfDayAbsence: null })
        .restOfDayAbsence,
    ).toBeNull();
    expect(resolvedSchedulePresentationSchema.parse(base).restOfDayAbsence).toBeUndefined();
  });
});
