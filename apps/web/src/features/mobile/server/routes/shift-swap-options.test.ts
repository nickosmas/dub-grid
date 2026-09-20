import { describe, expect, it } from "vitest";
import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { getSwapOptions } from "./shift-swap-options";

function entry(input: {
  employeeId: string;
  date: string;
  kind?: "worked" | "absence";
  start?: string;
  end?: string;
}): MobileScheduleEntry {
  const worked = (input.kind ?? "worked") === "worked";
  return {
    employeeId: input.employeeId,
    employeeFocusAreaIds: [1],
    date: input.date,
    state: {
      kind: worked ? "worked" : "absence",
      segments: worked ? [{ shiftId: 10, jobId: 20, position: 0 }] : [],
    },
    presentation: {
      label: worked ? "Day" : "Off",
      focusAreaId: 1,
      startTime: worked ? (input.start ?? "07:00:00") : null,
      endTime: worked ? (input.end ?? "15:00:00") : null,
      segments: [],
    },
  } as unknown as MobileScheduleEntry;
}

describe("getSwapOptions", () => {
  const requester = entry({ employeeId: "me", date: "2026-04-20" });

  it("offers a teammate's shift on a day the requester is free", () => {
    const candidate = entry({ employeeId: "them", date: "2026-04-21" });
    expect(getSwapOptions({ requesterEntry: requester, entries: [requester, candidate] })).toEqual([
      candidate,
    ]);
  });

  it("drops a same-day shift that overlaps the requester's own", () => {
    const candidate = entry({ employeeId: "them", date: "2026-04-20" });
    expect(getSwapOptions({ requesterEntry: requester, entries: [requester, candidate] })).toEqual(
      [],
    );
  });

  it("drops a day the requester has time off, like the database does", () => {
    const candidate = entry({ employeeId: "them", date: "2026-04-21" });
    const myTimeOff = entry({ employeeId: "me", date: "2026-04-21", kind: "absence" });
    expect(
      getSwapOptions({ requesterEntry: requester, entries: [requester, candidate, myTimeOff] }),
    ).toEqual([]);
  });

  it("drops a teammate who has time off on the requester's date", () => {
    const candidate = entry({ employeeId: "them", date: "2026-04-21" });
    const theirTimeOff = entry({ employeeId: "them", date: "2026-04-20", kind: "absence" });
    expect(
      getSwapOptions({ requesterEntry: requester, entries: [requester, candidate, theirTimeOff] }),
    ).toEqual([]);
  });
});
