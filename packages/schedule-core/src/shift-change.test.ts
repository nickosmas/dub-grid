import { describe, expect, it } from "vitest";
import {
  describeShiftChange,
  isNewShiftChange,
  describeShiftChangeItem,
  type ShiftChangeShiftInput,
} from "./shift-change";

const WED = "2026-10-21";

function shift(overrides: Partial<ShiftChangeShiftInput> = {}): ShiftChangeShiftInput {
  return {
    kind: "shift",
    key: "1:10",
    shiftName: "Day Shift",
    jobName: "Registered Nurse",
    focusAreaName: "Skilled Nursing",
    start: "07:00",
    end: "15:00",
    ...overrides,
  };
}

function text(parts: Array<{ text: string }>): string {
  return parts.map((p) => p.text).join("");
}

describe("describeShiftChangeItem", () => {
  it("writes a day shift as title and detail", () => {
    const item = describeShiftChangeItem(shift(), { date: WED });
    expect(text(item.title)).toBe("Day Shift · Registered Nurse");
    expect(text(item.detail)).toBe("7:00 AM - 3:00 PM (8 hrs) · Skilled Nursing");
    expect(item.plain).toBe(
      "Day Shift · Registered Nurse · 7:00 AM - 3:00 PM (8 hrs) · Skilled Nursing",
    );
    expect(item.minutes).toBe(480);
  });

  it("names both weekdays when a shift crosses midnight", () => {
    const item = describeShiftChangeItem(
      shift({ shiftName: "Night Shift", start: "23:00", end: "07:00" }),
      {
        date: WED,
      },
    );
    expect(text(item.detail)).toBe("Wed 11:00 PM - Thu 7:00 AM (8 hrs) · Skilled Nursing");
  });

  it("names the weekdays across a month end", () => {
    const item = describeShiftChangeItem(shift({ start: "23:00", end: "07:00" }), {
      date: "2026-10-31",
    });
    expect(text(item.detail)).toContain("Sat 11:00 PM - Sun 7:00 AM");
  });

  it("writes a job worked without a shift", () => {
    const item = describeShiftChangeItem(shift({ shiftName: null, jobName: "Charge Nurse" }), {
      date: WED,
    });
    expect(text(item.title)).toBe("Charge Nurse");
  });

  it("deducts the break from the hours", () => {
    const item = describeShiftChangeItem(shift({ end: "15:30", breakMinutes: 30 }), { date: WED });
    expect(text(item.detail)).toBe("7:00 AM - 3:30 PM (8 hrs) · Skilled Nursing");
    expect(item.minutes).toBe(480);
  });

  it("writes half hours and a single hour", () => {
    expect(text(describeShiftChangeItem(shift({ end: "14:30" }), { date: WED }).detail)).toContain(
      "(7.5 hrs)",
    );
    expect(text(describeShiftChangeItem(shift({ end: "08:00" }), { date: WED }).detail)).toContain(
      "(1 hr)",
    );
  });

  it("keeps an archived shift's name", () => {
    const item = describeShiftChangeItem(shift({ shiftName: "Weekend Day", shiftArchived: true }), {
      date: WED,
    });
    expect(text(item.title)).toBe("Weekend Day (archived) · Registered Nurse");
  });

  it("leaves out the time and hours when the times are unknown", () => {
    const item = describeShiftChangeItem(shift({ start: null, end: "15:00" }), { date: WED });
    expect(text(item.detail)).toBe("Skilled Nursing");
    expect(item.minutes).toBeNull();
    expect(item.plain).toBe("Day Shift · Registered Nurse · Skilled Nursing");
  });

  it("writes absences with their scope and no hours", () => {
    const allDay = describeShiftChangeItem(
      { kind: "absence", key: "absence:3", name: "Vacation", scope: "allDay" },
      { date: WED },
    );
    const restOfDay = describeShiftChangeItem(
      { kind: "absence", key: "absence:4", name: "Sick", scope: "restOfDay" },
      { date: WED },
    );
    expect(allDay.plain).toBe("Vacation (all day)");
    expect(restOfDay.plain).toBe("Sick (rest of day)");
    expect(restOfDay.detail).toEqual([]);
    expect(restOfDay.minutes).toBeNull();
  });

  it("marks changed fields and joins the separator only between two marked parts", () => {
    const endOnly = describeShiftChangeItem(shift(), {
      date: WED,
      marks: { end: true, hours: true },
    });
    expect(endOnly.detail.filter((p) => p.changed).map((p) => p.text)).toEqual([
      "3:00 PM",
      " ",
      "(8 hrs)",
    ]);

    const range = describeShiftChangeItem(shift(), {
      date: WED,
      marks: { start: true, end: true },
    });
    expect(range.detail.filter((p) => p.changed).map((p) => p.text)).toEqual([
      "7:00 AM",
      " - ",
      "3:00 PM",
    ]);
  });

  it("marks every part when the whole item changed", () => {
    const item = describeShiftChangeItem(shift(), { date: WED, marks: { all: true } });
    expect(item.title.every((p) => p.changed)).toBe(true);
    expect(item.detail.every((p) => p.changed)).toBe(true);
  });
});

const DATES = {
  mon: "2026-10-19",
  tue: "2026-10-20",
  wed: "2026-10-21",
  thu: "2026-10-22",
  fri: "2026-10-23",
  sat: "2026-10-24",
  sun: "2026-10-25",
};

function marked(parts: Array<{ text: string; changed?: boolean }>): string[] {
  return parts.filter((p) => p.changed).map((p) => p.text);
}

function absence(name: string, scope: "allDay" | "restOfDay", id = 4) {
  return { kind: "absence" as const, key: `absence:${id}`, name, scope };
}

describe("describeShiftChange, one item each side", () => {
  it("marks a focus area move on both sides (Mon)", () => {
    const change = describeShiftChange(
      { items: [shift()] },
      { items: [shift({ focusAreaName: "Memory Care" })] },
      { date: DATES.mon },
    );
    expect(change.kind).toBe("single");
    expect(marked(change.before.items[0].detail)).toEqual(["Skilled Nursing"]);
    expect(marked(change.after.items[0].detail)).toEqual(["Memory Care"]);
    expect(change.before.items[0].status).toBe("changed");
    expect(change.after.items[0].label).toBeNull();
    expect(change.before.totalMinutes).toBeNull();
  });

  it("marks an earlier end and its hours (Tue)", () => {
    const change = describeShiftChange(
      { items: [shift()] },
      { items: [shift({ end: "12:00" })] },
      { date: DATES.tue },
    );
    expect(marked(change.before.items[0].detail)).toEqual(["3:00 PM", " ", "(8 hrs)"]);
    expect(marked(change.after.items[0].detail)).toEqual(["12:00 PM", " ", "(5 hrs)"]);
  });

  it("marks a different shift and its times, not its unchanged hours (Wed)", () => {
    const change = describeShiftChange(
      { items: [shift()] },
      { items: [shift({ key: "3:10", shiftName: "Night Shift", start: "23:00", end: "07:00" })] },
      { date: DATES.wed },
    );
    expect(marked(change.before.items[0].title)).toEqual(["Day Shift"]);
    expect(marked(change.before.items[0].detail)).toEqual(["7:00 AM", " - ", "3:00 PM"]);
    expect(marked(change.after.items[0].title)).toEqual(["Night Shift"]);
    expect(marked(change.after.items[0].detail)).toEqual(["Wed 11:00 PM", " - ", "Thu 7:00 AM"]);
  });

  it("tags an added shift against an empty side (Fri)", () => {
    const change = describeShiftChange(
      { items: [] },
      {
        items: [
          shift({
            key: "3:10",
            shiftName: "Night Shift",
            start: "23:00",
            end: "07:00",
            focusAreaName: "Memory Care",
          }),
        ],
      },
      { date: DATES.fri },
    );
    expect(change.before.items).toEqual([]);
    expect(change.after.items[0].status).toBe("added");
    expect(change.after.items[0].plain).toBe(
      "Night Shift · Registered Nurse · Fri 11:00 PM - Sat 7:00 AM (8 hrs) · Memory Care",
    );
    expect(marked(change.after.items[0].detail)).toEqual([]);
  });

  it("tags a removed shift", () => {
    const change = describeShiftChange({ items: [shift()] }, { items: [] }, { date: DATES.tue });
    expect(change.before.items[0].status).toBe("removed");
    expect(change.after.items).toEqual([]);
  });

  it("marks the whole item when a shift becomes an absence (Sat)", () => {
    const change = describeShiftChange(
      { items: [shift({ shiftName: "Evening Shift", start: "15:00", end: "23:00" })] },
      { items: [absence("Vacation", "allDay", 3)] },
      { date: DATES.sat },
    );
    expect(change.before.items[0].title.every((p) => p.changed)).toBe(true);
    expect(change.before.items[0].detail.every((p) => p.changed)).toBe(true);
    expect(change.after.items[0].title.every((p) => p.changed)).toBe(true);
    expect(change.after.items[0].plain).toBe("Vacation (all day)");
  });

  it("marks a retired shift's replacement (Sun)", () => {
    const change = describeShiftChange(
      {
        items: [
          shift({ key: "9:10", shiftName: "Weekend Day", shiftArchived: true, end: "19:00" }),
        ],
      },
      { items: [shift()] },
      { date: DATES.sun },
    );
    expect(marked(change.before.items[0].title)).toEqual(["Weekend Day (archived)"]);
    expect(marked(change.before.items[0].detail)).toEqual(["7:00 PM", " ", "(12 hrs)"]);
    expect(marked(change.after.items[0].title)).toEqual(["Day Shift"]);
  });

  it("returns none for days that read the same", () => {
    expect(
      describeShiftChange({ items: [shift()] }, { items: [shift()] }, { date: DATES.mon }).kind,
    ).toBe("none");
    expect(describeShiftChange({ items: [] }, { items: [] }, { date: DATES.mon }).kind).toBe(
      "none",
    );
  });
});

const evening = () =>
  shift({ key: "2:10", shiftName: "Evening Shift", start: "15:00", end: "23:00" });

describe("describeShiftChange, whole days", () => {
  it("pairs Thursday's double shift and absence by what they are (Thu)", () => {
    const change = describeShiftChange(
      { items: [shift(), evening()] },
      { items: [absence("Sick", "restOfDay"), shift({ end: "12:00" })] },
      { date: DATES.thu },
    );
    expect(change.kind).toBe("multi");
    expect(change.before.items.map((i) => [i.label, i.status])).toEqual([
      ["shift1", "changed"],
      ["shift2", "removed"],
    ]);
    expect(change.after.items.map((i) => [i.label, i.status])).toEqual([
      ["shift1", "changed"],
      ["absence", "added"],
    ]);
    expect(change.before.totalMinutes).toBe(16 * 60);
    expect(change.after.totalMinutes).toBe(5 * 60);
    expect(marked(change.after.items[0].detail)).toEqual(["12:00 PM", " ", "(5 hrs)"]);
  });

  it("keeps an unchanged shift as same beside a change", () => {
    const change = describeShiftChange(
      { items: [shift(), evening()] },
      { items: [shift(), evening(), absence("Sick", "restOfDay")] },
      { date: DATES.thu },
    );
    expect(change.after.items.map((i) => i.status)).toEqual(["same", "same", "added"]);
  });

  it("returns none when two identical shifts only swap order", () => {
    const change = describeShiftChange(
      { items: [shift(), evening()] },
      { items: [evening(), shift()] },
      { date: DATES.thu },
    );
    expect(change.kind).toBe("none");
  });

  it("gives no total when no item has known times", () => {
    const change = describeShiftChange(
      { items: [shift({ start: null, end: null }), evening()] },
      { items: [shift({ start: null, end: null })] },
      { date: DATES.thu },
    );
    expect(change.after.totalMinutes).toBeNull();
    expect(change.before.totalMinutes).toBe(8 * 60);
  });

  it("gives an empty side no total", () => {
    const change = describeShiftChange(
      { items: [] },
      { items: [shift(), evening()] },
      { date: DATES.thu },
    );
    expect(change.before.totalMinutes).toBeNull();
    expect(change.after.items.map((i) => i.status)).toEqual(["added", "added"]);
  });
});

describe("describeShiftChange, breaks and the day bar", () => {
  it("draws Thursday with no breaks on a 7:00 AM to 11:00 PM scale", () => {
    const change = describeShiftChange(
      { items: [shift(), evening()] },
      { items: [shift({ end: "12:00" }), absence("Sick", "restOfDay")] },
      { date: DATES.thu },
    );
    expect(change.before.items.map((i) => i.breakBefore)).toEqual([null, null]);
    expect(change.after.items.map((i) => i.breakBefore)).toEqual([null, null]);
    expect(change.barScale).toEqual({ start: "07:00", end: "23:00", minutes: 16 * 60 });
    expect(change.before.items.map((i) => i.bar)).toEqual([
      { from: 0, to: 480 },
      { from: 480, to: 960 },
    ]);
    expect(change.after.items.map((i) => i.bar)).toEqual([
      { from: 0, to: 300 },
      { from: 300, to: 960 },
    ]);
  });

  it("shows the breaks in a split double on a scale that runs past midnight", () => {
    const night = shift({ key: "3:10", shiftName: "Night Shift", start: "23:00", end: "07:00" });
    const change = describeShiftChange(
      { items: [shift(), night] },
      { items: [shift({ end: "11:00" }), evening()] },
      { date: "2026-10-26" },
    );
    expect(change.before.items[1].breakBefore).toEqual({
      minutes: 480,
      start: "15:00",
      end: "23:00",
    });
    expect(change.after.items[1].breakBefore).toEqual({
      minutes: 240,
      start: "11:00",
      end: "15:00",
    });
    expect(change.barScale).toEqual({ start: "07:00", end: "07:00", minutes: 24 * 60 });
    expect(change.before.items[1].bar).toEqual({ from: 960, to: 1440 });
    expect(change.before.totalMinutes).toBe(16 * 60);
    expect(change.after.totalMinutes).toBe(12 * 60);
  });

  it("never gives overlapping shifts a break or a negative length", () => {
    const change = describeShiftChange(
      {
        items: [
          shift(),
          shift({ key: "5:10", shiftName: "Mid Shift", start: "14:00", end: "22:00" }),
        ],
      },
      { items: [shift()] },
      { date: DATES.thu },
    );
    expect(change.before.items[1].breakBefore).toBeNull();
    expect(change.before.items.every((i) => i.bar && i.bar.to > i.bar.from)).toBe(true);
  });

  it("stretches the scale to midnight when a rest-of-day absence would have no width", () => {
    const change = describeShiftChange(
      { items: [shift()] },
      { items: [shift(), absence("Sick", "restOfDay")] },
      { date: DATES.thu },
    );
    expect(change.barScale).toEqual({ start: "07:00", end: "00:00", minutes: 17 * 60 });
    expect(change.after.items[1].bar).toEqual({ from: 480, to: 17 * 60 });
  });
});

describe("isNewShiftChange", () => {
  it("is true only for a day that had nothing", () => {
    const date = { date: DATES.thu };
    expect(isNewShiftChange(describeShiftChange({ items: [] }, { items: [shift()] }, date))).toBe(
      true,
    );
    expect(
      isNewShiftChange(describeShiftChange({ items: [] }, { items: [shift(), evening()] }, date)),
    ).toBe(true);
    expect(
      isNewShiftChange(describeShiftChange({ items: [shift()] }, { items: [evening()] }, date)),
    ).toBe(false);
    expect(
      isNewShiftChange(
        describeShiftChange({ items: [shift()] }, { items: [shift(), evening()] }, date),
      ),
    ).toBe(false);
    expect(isNewShiftChange(describeShiftChange({ items: [shift()] }, { items: [] }, date))).toBe(
      false,
    );
    expect(isNewShiftChange(describeShiftChange({ items: [] }, { items: [] }, date))).toBe(false);
  });
});
