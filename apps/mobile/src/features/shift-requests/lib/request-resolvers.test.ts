import type { MobileShiftRequest } from "@dubgrid/contracts";
import { describeRequestForViewer } from "@dubgrid/schedule-core";
import { describe, expect, it } from "vitest";
import { buildRequestResolvers } from "./request-resolvers";

const presentation = {
  label: "D",
  shiftName: "Day Shift",
  focusAreaId: 11,
  focusAreaName: "Skilled Nursing",
  displayFocusAreaName: "Skilled Nursing",
  startTime: "07:00",
  endTime: "15:30",
  segments: [
    {
      shiftId: 5,
      jobId: 8,
      shiftName: "Day Shift",
      jobName: "Supervisor",
      shiftStartTime: "07:00",
      shiftEndTime: "15:30",
      startTime: "07:00",
      endTime: "15:30",
      focusAreaId: 11,
      displayFocusAreaName: "Skilled Nursing",
    },
  ],
} as MobileShiftRequest["requesterPresentation"];

const request = {
  type: "calloff",
  status: "pending_approval",
  requesterEmpId: "laura",
  requesterName: "Laura Marshall",
  requesterShiftDate: "2026-11-19",
  requesterState: {
    kind: "worked",
    segments: [{ shiftId: 5, jobId: 8, position: 0 }],
    absenceTypeId: null,
    customStartTime: null,
    customEndTime: null,
    seriesId: null,
    fromRecurring: false,
  },
  requesterPresentation: presentation,
  targetEmpId: null,
  targetName: null,
  targetShiftDate: null,
  targetState: null,
  targetPresentation: null,
  absenceTypeId: 9,
  parentRequestId: null,
  createdAt: "2026-11-16T15:00:00.000Z",
} as unknown as MobileShiftRequest;

const bootstrap = {
  absenceTypes: [{ id: 9, label: "S", name: "Sick" }],
  focusAreas: [{ id: 11, name: "Skilled Nursing" }],
};

describe("buildRequestResolvers", () => {
  it("names the request's shift, job and absence as the web does", () => {
    const text = describeRequestForViewer({
      request,
      viewerEmpId: "boss",
      resolvers: buildRequestResolvers(request, bootstrap),
      formatAsked: () => "Nov 16, 7:00 AM",
    });
    expect(text?.body).toBe(
      "If approved, Laura is marked Sick and the Day Shift · Supervisor opens for pickup.",
    );
  });

  it("finds nothing it wasn't given", () => {
    const resolvers = buildRequestResolvers(request, null);
    expect(resolvers.segment(99, 8)).toBeNull();
    expect(resolvers.absenceType(9)).toBeNull();
    expect(resolvers.focusArea(11)).toBeNull();
  });
});
