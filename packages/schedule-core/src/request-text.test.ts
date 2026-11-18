import { describe, expect, it } from "vitest";
import type { ScheduleCellState } from "@dubgrid/contracts";
import {
  describeRequestForViewer,
  requestTextMarkFor,
  type RequestViewerRequest,
} from "./request-text";
import type { ShiftChangeResolvers } from "./shift-change-input";

const resolvers: ShiftChangeResolvers = {
  segment(shiftId, jobId) {
    if (jobId !== 8) return null;
    if (shiftId === 5)
      return {
        shiftName: "Day Shift",
        jobName: "Supervisor",
        focusAreaId: 11,
        defaultStart: "07:00",
        defaultEnd: "15:30",
      };
    if (shiftId === 6)
      return {
        shiftName: "Evening Shift",
        jobName: "Supervisor",
        focusAreaId: 11,
        defaultStart: "15:30",
        defaultEnd: "00:00",
      };
    return null;
  },
  absenceType: (id) => (id === 9 ? { name: "Sick" } : null),
  focusArea: (id) => (id === 11 ? "Skilled Nursing" : null),
};

const worked = (shiftId: number): ScheduleCellState => ({
  kind: "worked",
  segments: [{ shiftId, jobId: 8, position: 0 }],
  absenceTypeId: null,
  customStartTime: null,
  customEndTime: null,
  seriesId: null,
  fromRecurring: false,
});

function request(overrides: Partial<RequestViewerRequest>): RequestViewerRequest {
  return {
    type: "pickup",
    status: "open",
    requesterEmpId: "laura",
    requesterName: "Laura Marshall",
    requesterShiftDate: "2026-11-19",
    requesterState: worked(5),
    targetEmpId: null,
    targetName: null,
    targetShiftDate: null,
    targetState: null,
    absenceTypeId: null,
    parentRequestId: null,
    createdAt: "2026-11-16T15:00:00.000Z",
    ...overrides,
  };
}

const describeFor = (overrides: Partial<RequestViewerRequest>, viewerEmpId: string | null) =>
  describeRequestForViewer({
    request: request(overrides),
    viewerEmpId,
    resolvers,
    formatAsked: () => "Nov 16, 7:00 AM",
  });

const named = { targetEmpId: "carol", targetName: "Carol Henderson", absenceTypeId: 9 };

const swap = {
  type: "swap" as const,
  targetEmpId: "carol",
  targetName: "Carol Henderson",
  targetShiftDate: "2026-11-19",
  targetState: worked(6),
};

describe("describeRequestForViewer", () => {
  it("shows an unclaimed offer from the asker's side", () => {
    expect(describeFor({}, "laura")?.body).toBe(
      "Laura keeps this shift until a claim is approved.",
    );
  });

  it("shows the teammate a named pickup asks their own side", () => {
    expect(describeFor(named, "carol")).toMatchObject({
      status: "Asked by Laura Marshall to pick up · waiting for Carol",
      body:
        "If accepted and approved, Carol works Laura's Day Shift · Supervisor · Skilled Nursing · " +
        "7:00 AM - 3:30 PM (8.5 hrs) and Laura is Sick.",
    });
  });

  it("shows an approver what approving does", () => {
    expect(describeFor({ ...named, status: "pending_approval" }, "boss")).toMatchObject({
      status: "Pickup by Carol Henderson · awaiting approval",
      body: "If approved, Carol works Laura's Day Shift · Supervisor and Laura is Sick.",
    });
    expect(
      describeFor({ type: "calloff", status: "pending_approval", absenceTypeId: 9 }, "boss")?.body,
    ).toBe("If approved, Laura is marked Sick and the Day Shift · Supervisor opens for pickup.");
  });

  it("shows each side of a swap the shift it would take", () => {
    expect(describeFor(swap, "carol")?.body).toBe(
      "Carol would work Laura's Day Shift · Supervisor · Skilled Nursing · 7:00 AM - 3:30 PM " +
        "(8.5 hrs). Laura would work Carol's Evening Shift · Supervisor.",
    );
    expect(describeFor({ ...swap, status: "pending_approval" }, "boss")?.status).toBe(
      "Swap with Carol Henderson · awaiting approval",
    );
  });

  it("shows a claimer of a call-off's open shift what they would work", () => {
    expect(
      describeFor(
        {
          status: "pending_approval",
          parentRequestId: "calloff-1",
          targetEmpId: "carol",
          targetName: "Carol Henderson",
        },
        "carol",
      ),
    ).toMatchObject({
      status: "Claiming Laura Marshall's shift · awaiting approval",
      asked: "Opened Nov 16, 7:00 AM.",
    });
  });

  it("has nothing to say once a request is settled", () => {
    for (const status of ["approved", "rejected", "cancelled", "expired"]) {
      expect(describeFor({ status }, "boss")).toBeNull();
      expect(requestTextMarkFor(request({ status }), "boss")).toBeNull();
    }
  });
});
