import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { describe, expect, it } from "vitest";
import { isHomeWeekEmpty, workingThatDay } from "./home-day";

const entry = (employeeId: string, date: string, extra: Partial<MobileScheduleEntry> = {}) =>
  ({ employeeId, date, ...extra }) as MobileScheduleEntry;

describe("workingThatDay", () => {
  it("lists everyone on that day but the viewer, once each", () => {
    const team = [
      entry("me", "2026-11-03"),
      entry("ana", "2026-11-03"),
      entry("ana", "2026-11-03"),
      entry("ben", "2026-11-04"),
    ];
    expect(workingThatDay(team, "2026-11-03", "me").map((e) => e.employeeId)).toEqual(["ana"]);
  });
});

describe("isHomeWeekEmpty", () => {
  const day = "2026-11-10";

  it("is empty with no shift of yours and nobody on the day beside it", () => {
    expect(isHomeWeekEmpty({ entries: [], teamEntries: [], day, viewerId: "me" })).toBe(true);
  });

  it("keeps the split while someone else works the day", () => {
    expect(
      isHomeWeekEmpty({ entries: [], teamEntries: [entry("ana", day)], day, viewerId: "me" }),
    ).toBe(false);
  });

  it("keeps the split while you have a shift that week", () => {
    expect(
      isHomeWeekEmpty({
        entries: [entry("me", "2026-11-12")],
        teamEntries: [],
        day,
        viewerId: "me",
      }),
    ).toBe(false);
  });
});
