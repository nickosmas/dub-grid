import { describe, expect, it } from "vitest";
import { awayAllPeriodReason, orderAwayAllPeriod, type AwayAllPeriodInput } from "./awayAllPeriod";

const week = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"];
const names: Record<number, string> = { 1: "Vacation", 2: "Sick", 9: "Day Off" };

function reason(overrides: Partial<AwayAllPeriodInput>) {
  return awayAllPeriodReason({
    dateKeys: week,
    range: null,
    absenceTypeIdOn: () => null,
    shiftCountOn: () => 0,
    dayOffAbsenceTypeId: 9,
    absenceName: (id) => names[id],
    ...overrides,
  });
}

describe("awayAllPeriodReason", () => {
  it("names the return date of someone away every day", () => {
    expect(reason({ range: { from: null, until: "2026-11-09" } })).toBe("Away until Nov 9");
  });

  it("names a whole-day absence held every day, and several as absent", () => {
    expect(reason({ absenceTypeIdOn: () => 1 })).toBe("Vacation every day");
    expect(reason({ absenceTypeIdOn: (day) => (day < "2026-11-03" ? 1 : 2) })).toBe(
      "Absent every day",
    );
  });

  it("joins away days and absences into one stretch", () => {
    expect(
      reason({
        range: { from: "2026-11-03", until: null },
        absenceTypeIdOn: () => 1,
      }),
    ).toBe("Away");
  });

  it("leaves out anyone with a shift, an empty day, or only the day off absence", () => {
    expect(
      reason({ absenceTypeIdOn: () => 1, shiftCountOn: (day) => (day === week[2] ? 1 : 0) }),
    ).toBeNull();
    expect(reason({ absenceTypeIdOn: (day) => (day === week[0] ? null : 1) })).toBeNull();
    expect(reason({ absenceTypeIdOn: () => 9 })).toBeNull();
    expect(reason({ absenceTypeIdOn: (day) => (day === week[0] ? 9 : 1) })).toBeNull();
  });

  it("names a first day still ahead and a last day passed", () => {
    expect(
      reason({ range: { from: "2026-11-10", until: "2026-11-10", firstDay: "2026-11-10" } }),
    ).toBe("Starts Nov 10");
    expect(reason({ range: { from: "2026-10-30", until: null, lastDay: "2026-10-29" } })).toBe(
      "Offboarded",
    );
  });
});

describe("orderAwayAllPeriod", () => {
  const dates = week.map((key) => new Date(`${key}T00:00:00`));
  const person = (id: string) => ({ id, status: "active" as const, archivedAt: null });
  const vacationFor = (ids: string[]) => (empId: string) => (ids.includes(empId) ? 1 : null);

  it("puts anyone away every day last, with why", () => {
    const { employees, awayAllPeriod } = orderAwayAllPeriod([person("a"), person("b")], {
      dates,
      absenceTypeIdForKey: vacationFor(["a"]),
      assignmentIdsForKey: () => [],
      absenceName: (id) => names[id],
    });
    expect(employees.map((employee) => employee.id)).toEqual(["b", "a"]);
    expect([...awayAllPeriod]).toEqual([["a", "Vacation every day"]]);
  });

  it("makes no group when everyone is away", () => {
    const { employees, awayAllPeriod } = orderAwayAllPeriod([person("a"), person("b")], {
      dates,
      absenceTypeIdForKey: vacationFor(["a", "b"]),
      assignmentIdsForKey: () => [],
      absenceName: (id) => names[id],
    });
    expect(employees.map((employee) => employee.id)).toEqual(["a", "b"]);
    expect(awayAllPeriod.size).toBe(0);
  });

  it("groups someone leaving before the period only for an editor", () => {
    const leaving = {
      ...person("a"),
      plannedStatus: "removed" as const,
      plannedFrom: "2026-10-30",
    };
    const order = (isScheduleEditor: boolean) =>
      orderAwayAllPeriod([leaving, person("b")], {
        dates,
        isScheduleEditor,
        assignmentIdsForKey: () => [],
        absenceName: (id) => names[id],
      });
    expect([...order(true).awayAllPeriod.keys()]).toEqual(["a"]);
    expect(order(false).awayAllPeriod.size).toBe(0);
  });
});
