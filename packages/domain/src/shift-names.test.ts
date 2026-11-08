import { describe, expect, it } from "vitest";
import { shiftDisplayName, shiftDisplayNamesById } from "./shift-names";

const AREAS = new Map([
  [1, "Skilled Nursing"],
  [2, "Supported Care"],
]);
const areaName = (id: number) => AREAS.get(id);

const SHIFTS = [
  { id: 10, name: "Day Shift", focusAreaId: 1 },
  { id: 11, name: "Day Shift", focusAreaId: 2 },
  { id: 12, name: "Night Shift", focusAreaId: 1 },
  { id: 13, name: "General", focusAreaId: null },
  { id: 14, name: "General", focusAreaId: 2 },
  { id: 15, name: "Swing", focusAreaId: 1 },
  { id: 16, name: "swing", focusAreaId: 2, archivedAt: "2026-10-01T00:00:00Z" },
];

describe("shiftDisplayName", () => {
  it("keeps a unique name as it is", () => {
    expect(shiftDisplayName(SHIFTS[2], SHIFTS, areaName)).toBe("Night Shift");
  });

  it("names the focus area when another area's shift shares the name", () => {
    expect(shiftDisplayName(SHIFTS[0], SHIFTS, areaName)).toBe("Day Shift (Skilled Nursing)");
    expect(shiftDisplayName(SHIFTS[1], SHIFTS, areaName)).toBe("Day Shift (Supported Care)");
  });

  it("leaves an org-wide shift bare and names the area shift sharing its name", () => {
    expect(shiftDisplayName(SHIFTS[3], SHIFTS, areaName)).toBe("General");
    expect(shiftDisplayName(SHIFTS[4], SHIFTS, areaName)).toBe("General (Supported Care)");
  });

  it("ignores an archived shift with the same name", () => {
    expect(shiftDisplayName(SHIFTS[5], SHIFTS, areaName)).toBe("Swing");
  });

  it("still names the area of an archived shift that shares an active one's name", () => {
    expect(shiftDisplayName(SHIFTS[6], SHIFTS, areaName)).toBe("swing (Supported Care)");
  });

  it("falls back to the bare name when the area is unknown", () => {
    expect(shiftDisplayName({ ...SHIFTS[0], focusAreaId: 99 }, SHIFTS, areaName)).toBe("Day Shift");
  });
});

describe("shiftDisplayNamesById", () => {
  it("labels every shift by id", () => {
    const labels = shiftDisplayNamesById(SHIFTS.slice(0, 3), [
      { id: 1, name: "Skilled Nursing" },
      { id: 2, name: "Supported Care" },
    ]);
    expect([...labels]).toEqual([
      [10, "Day Shift (Skilled Nursing)"],
      [11, "Day Shift (Supported Care)"],
      [12, "Night Shift"],
    ]);
  });
});
