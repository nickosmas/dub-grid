import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { fetchHiddenInternalUserIds } from "@dubgrid/data-access";
import { INTERNAL_IDS, VIEWERS, internalProfilesFrom } from "@/__tests__/helpers/internal-people";
import { fetchActiveEmployeeIds, getSwapOptions } from "./shift-swap-options";

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
  const ACTIVE = new Set(["me", "them"]);

  it("offers a teammate's shift on a day the requester is free", () => {
    const candidate = entry({ employeeId: "them", date: "2026-04-21" });
    expect(
      getSwapOptions({
        requesterEntry: requester,
        activeEmployeeIds: ACTIVE,
        entries: [requester, candidate],
      }),
    ).toEqual([candidate]);
  });

  it("drops a same-day shift that overlaps the requester's own", () => {
    const candidate = entry({ employeeId: "them", date: "2026-04-20" });
    expect(
      getSwapOptions({
        requesterEntry: requester,
        activeEmployeeIds: ACTIVE,
        entries: [requester, candidate],
      }),
    ).toEqual([]);
  });

  it("drops a day the requester has time off, like the database does", () => {
    const candidate = entry({ employeeId: "them", date: "2026-04-21" });
    const myTimeOff = entry({ employeeId: "me", date: "2026-04-21", kind: "absence" });
    expect(
      getSwapOptions({
        requesterEntry: requester,
        activeEmployeeIds: ACTIVE,
        entries: [requester, candidate, myTimeOff],
      }),
    ).toEqual([]);
  });

  it("drops a teammate who has time off on the requester's date", () => {
    const candidate = entry({ employeeId: "them", date: "2026-04-21" });
    const theirTimeOff = entry({ employeeId: "them", date: "2026-04-20", kind: "absence" });
    expect(
      getSwapOptions({
        requesterEntry: requester,
        activeEmployeeIds: ACTIVE,
        entries: [requester, candidate, theirTimeOff],
      }),
    ).toEqual([]);
  });

  it("drops a teammate who is no longer active", () => {
    const candidate = entry({ employeeId: "left", date: "2026-04-21" });
    expect(
      getSwapOptions({
        requesterEntry: requester,
        activeEmployeeIds: ACTIVE,
        entries: [requester, candidate],
      }),
    ).toEqual([]);
  });
});

describe("fetchActiveEmployeeIds", () => {
  const STAFF = [
    { id: "member", user_id: "member-1" },
    { id: "qa", user_id: "qa-person" },
    { id: "no-account", user_id: null },
  ];

  function staffQuery() {
    let rows = STAFF;
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      or: (filter: string) => {
        const dropped = filter.match(/not\.in\.\((.*)\)$/)?.[1]?.split(",") ?? [];
        rows = rows.filter((row) => row.user_id === null || !dropped.includes(row.user_id));
        return query;
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return query;
  }

  async function poolFor(viewer: (typeof VIEWERS)[keyof typeof VIEWERS]) {
    const client = {
      from: internalProfilesFrom(INTERNAL_IDS, staffQuery),
    } as unknown as SupabaseClient;
    const hidden = await fetchHiddenInternalUserIds(client, {
      userId: viewer.actor.id,
      isGridmaster: viewer.isGridmaster,
    });
    return [...(await fetchActiveEmployeeIds(client, "org-1", hidden))];
  }

  it("never offers a client an internal account as a partner", async () => {
    expect(await poolFor(VIEWERS.client)).toEqual(["member", "no-account"]);
  });

  it("keeps internal accounts for an internal viewer and a Gridmaster", async () => {
    expect(await poolFor(VIEWERS.internal)).toEqual(["member", "qa", "no-account"]);
    expect(await poolFor(VIEWERS.gridmaster)).toEqual(["member", "qa", "no-account"]);
  });
});
