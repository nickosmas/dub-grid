import { describe, expect, it } from "vitest";
import { buildPersonRequestRows, requestRowsInRange } from "./person-requests";
import type { ProfileChangeRequest } from "@/features/account/client/api";
import type { ShiftRequest } from "@/types";

const swap = {
  id: "r1",
  type: "swap",
  status: "pending_approval",
  requesterEmpId: "emp",
  requesterName: "Ann Hart",
  requesterShiftDate: "2026-11-08",
  requesterSegments: [{ shiftName: "Evening Shift" }],
  requesterShiftLabel: "E",
  targetEmpId: "emp-2",
  targetName: "Margaret Sullivan",
  targetShiftDate: "2026-11-09",
  targetSegments: [{ shiftName: "Day Shift" }],
  targetShiftLabel: "D",
  adminUserId: null,
  createdAt: "2026-10-28T12:00:00Z",
} as unknown as ShiftRequest;

const pickupTheyTook = {
  ...swap,
  id: "r2",
  type: "pickup",
  status: "approved",
  requesterEmpId: "emp-3",
  requesterName: "Cal Moss",
  targetEmpId: "emp",
  targetName: "Ann Hart",
  targetShiftDate: "2026-10-19",
  targetSegments: [],
  targetShiftLabel: "Day Shift",
  adminUserId: "user-admin",
  createdAt: "2026-10-15T12:00:00Z",
} as unknown as ShiftRequest;

const profile = {
  id: "p1",
  type: "profile_update",
  status: "pending",
  requesterEmployeeId: "emp",
  requestedChanges: { lastName: "Hart-Lee", focusAreaIds: [1] },
  requestNote: "Married",
  resolverUserId: null,
  createdAt: "2026-10-26T09:00:00Z",
} as unknown as ProfileChangeRequest;

const names = (id: string) => (id === "user-admin" ? "QA SuperAdmin" : null);

describe("buildPersonRequestRows", () => {
  it("lists shift and profile requests newest first, spelled out", () => {
    const rows = buildPersonRequestRows("emp", [swap, pickupTheyTook], [profile], names, {
      focusAreaLabel: "Wings",
    });
    expect(rows.map((row) => row.key)).toEqual(["shift-r1", "profile-p1", "shift-r2"]);
    expect(rows[0]).toMatchObject({
      type: "Swap",
      details: "Sun, Nov 8 · Evening Shift",
      secondary: "with Margaret Sullivan",
      state: "Awaiting approval",
      tone: "warning",
      waiting: true,
      reviewHref: "/schedule?requests=approval",
    });
    expect(rows[1]).toMatchObject({
      type: "Profile change",
      details: "Last name, Wings",
      secondary: "Married",
      waiting: true,
      reviewHref: "/people",
    });
  });

  it("reads their side of a request someone else made, with who decided", () => {
    const [row] = buildPersonRequestRows("emp", [pickupTheyTook], [], names);
    expect(row).toMatchObject({
      type: "Pickup",
      details: "Mon, Oct 19 · Day Shift",
      secondary: "from Cal Moss",
      state: "Approved",
      decidedBy: "QA SuperAdmin",
      waiting: false,
    });
  });

  it("leaves out someone else's profile request", () => {
    const rows = buildPersonRequestRows(
      "emp",
      [],
      [{ ...profile, requesterEmployeeId: "emp-9" } as ProfileChangeRequest],
      names,
    );
    expect(rows).toEqual([]);
  });
});

describe("requestRowsInRange", () => {
  it("keeps the requests sent inside the period", () => {
    const rows = buildPersonRequestRows("emp", [swap, pickupTheyTook], [profile], names);
    expect(
      requestRowsInRange(rows, { startDate: "2026-10-25", endDate: "2026-10-31" }).map(
        (row) => row.key,
      ),
    ).toEqual(["shift-r1", "profile-p1"]);
  });
});
