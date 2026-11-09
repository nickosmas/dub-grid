import type { ShiftChangeResolvers } from "@dubgrid/schedule-core";
import { describe, expect, it } from "vitest";
import { requestEmailDetails, type RequestEmailFacts } from "./request-email";

const resolvers: ShiftChangeResolvers = {
  segment: () => ({
    shiftName: "Day Shift",
    jobName: "Registered Nurse",
    focusAreaId: 1,
    defaultStart: "07:00",
    defaultEnd: "15:00",
  }),
  absenceType: () => ({ name: "Sick" }),
  focusArea: () => "Memory Care",
};

const workedCell = {
  kind: "worked",
  segments: [{ position: 0, shiftId: 1, jobId: 2 }],
};

const swap: RequestEmailFacts = {
  type: "swap",
  requesterName: "Sam Rivera",
  requesterUserId: "sam-user",
  targetName: "Alex Kim",
  targetUserId: "alex-user",
  requesterDate: "2026-11-13",
  requesterState: workedCell,
  targetDate: "2026-11-15",
  targetState: workedCell,
  absenceName: null,
  expiresAt: "2026-11-12T20:00:00.000Z",
  timeZone: "America/Los_Angeles",
  resolvers,
};

const SHIFT = "Day Shift · Registered Nurse · Memory Care · 7:00 AM - 3:00 PM (8 hrs)";

describe("requestEmailDetails", () => {
  it("names both shifts in full for an approver, with the deadline", () => {
    expect(requestEmailDetails(swap, { viewer: "approver", waiting: true })).toEqual([
      { label: "Sam Rivera's shift", value: `Fri, Nov 13 · ${SHIFT}` },
      { label: "Alex Kim's shift", value: `Sun, Nov 15 · ${SHIFT}` },
      { label: "Expires", value: "November 12, 2026 at 12:00 PM PST" },
    ]);
  });

  it("says Your shift from each party's side", () => {
    const labels = (viewer: "requester" | "target") =>
      requestEmailDetails(swap, { viewer }).map((detail) => detail.label);
    expect(labels("requester")).toEqual(["Your shift", "Alex Kim's shift"]);
    expect(labels("target")).toEqual(["Sam Rivera's shift", "Your shift"]);
  });

  it("says Your shift to an approver who is on the request", () => {
    const labels = (readerUserId: string) =>
      requestEmailDetails(swap, { viewer: "approver", readerUserId }).map((detail) => detail.label);
    expect(labels("sam-user")).toEqual(["Your shift", "Alex Kim's shift"]);
    expect(labels("alex-user")).toEqual(["Sam Rivera's shift", "Your shift"]);
    expect(labels("other-user")).toEqual(["Sam Rivera's shift", "Alex Kim's shift"]);
  });

  it("leaves the deadline off a settled request and adds the manager's note", () => {
    expect(
      requestEmailDetails(swap, { viewer: "requester", note: "Short staffed" }).at(-1),
    ).toEqual({ label: "Manager's note", value: "Short staffed" });
  });

  it("tells approvers why someone called off, but not whoever picks it up", () => {
    const pickup: RequestEmailFacts = {
      ...swap,
      type: "pickup",
      absenceName: "Sick",
      targetDate: "2026-11-13",
    };
    expect(requestEmailDetails(pickup, { viewer: "approver" })).toContainEqual({
      label: "Absence",
      value: "Sick",
    });
    expect(requestEmailDetails(pickup, { viewer: "target" }).map((detail) => detail.label)).toEqual(
      ["Sam Rivera's shift"],
    );
  });

  it("falls back to the date when the organization's names can't be read", () => {
    expect(requestEmailDetails({ ...swap, resolvers: null }, { viewer: "approver" })[0]).toEqual({
      label: "Sam Rivera's shift",
      value: "Fri, Nov 13",
    });
  });
});
