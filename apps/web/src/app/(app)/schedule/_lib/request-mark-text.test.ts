import { describe, expect, it } from "vitest";
import type { ShiftChangeResolvers } from "@dubgrid/schedule-core";
import type { ScheduleCellState, ShiftRequest } from "@/types";
import { buildRequestMarks } from "./request-marks";
import { describeRequestMark } from "./request-mark-text";

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
  absenceType: (id) => (id === 9 ? { name: "Sick" } : id === 4 ? { name: "Off" } : null),
  focusArea: (id) => (id === 11 ? "Skilled Nursing" : null),
};

const worked = (...shiftIds: number[]): ScheduleCellState => ({
  kind: "worked",
  segments: shiftIds.map((shiftId, position) => ({ shiftId, jobId: 8, position })),
  absenceTypeId: null,
  customStartTime: null,
  customEndTime: null,
  seriesId: null,
  fromRecurring: false,
});

function request(overrides: Partial<ShiftRequest>): ShiftRequest {
  return {
    id: "req-1",
    orgId: "org-1",
    type: "pickup",
    status: "open",
    requesterEmpId: "laura",
    requesterName: "Laura Marshall",
    requesterShiftDate: "2026-11-19",
    requesterState: worked(5),
    requesterAssignmentDefinitionIds: [21],
    requesterShiftLabel: "Day Shift",
    requesterFocusAreaId: 11,
    requesterCustomStartTime: null,
    requesterCustomEndTime: null,
    targetEmpId: null,
    targetName: null,
    targetShiftDate: null,
    targetState: null,
    targetAssignmentDefinitionIds: null,
    targetShiftLabel: null,
    targetFocusAreaId: null,
    targetCustomStartTime: null,
    targetCustomEndTime: null,
    absenceTypeId: null,
    parentRequestId: null,
    adminUserId: null,
    adminNote: null,
    expiresAt: "2026-11-17T08:00:00.000Z",
    resolvedAt: null,
    // 8:02 AM in Los Angeles.
    createdAt: "2026-11-14T16:02:00.000Z",
    updatedAt: "2026-11-14T16:02:00.000Z",
    ...overrides,
  };
}

/** The text for each day the request marks, keyed by cell or open shift. */
function texts(req: ShiftRequest) {
  const marks = buildRequestMarks([req]);
  const out: Record<string, ReturnType<typeof describeRequestMark>> = {};
  for (const [key, list] of marks.byCell) {
    out[key] = describeRequestMark({
      mark: list[0]!,
      request: req,
      resolvers,
      timeZone: "America/Los_Angeles",
    });
  }
  for (const [key, mark] of marks.byOpenShift) {
    out[`open:${key}`] = describeRequestMark({
      mark,
      request: req,
      resolvers,
      timeZone: "America/Los_Angeles",
    });
  }
  return out;
}

const L = "laura_2026-11-19";
const T = "thomas_2026-11-19";
const DAY_FULL = "Day Shift · Supervisor · Skilled Nursing · 7:00 AM - 3:30 PM (8.5 hrs)";
const AT = "Nov 14, 2026, 8:02 AM PST";
const thomas = {
  targetEmpId: "thomas",
  targetName: "Thomas Crawford",
  targetShiftDate: "2026-11-19",
};

describe("describeRequestMark", () => {
  it("describes an unclaimed offer", () => {
    expect(texts(request({}))[L]).toEqual({
      status: "Offered for pickup · waiting for a teammate",
      body: "Laura keeps this shift until a claim is approved.",
      asked: `Offered ${AT}.`,
    });
  });

  it("describes a claimed offer on both days, spelling out only the shift not on screen", () => {
    const out = texts(request({ status: "pending_approval", ...thomas }));
    expect(out[L]).toEqual({
      status: "Claimed by Thomas Crawford · awaiting approval",
      body: "If approved, Thomas works Laura's Day Shift · Supervisor.",
      asked: `Offered ${AT}.`,
    });
    expect(out[T]).toEqual({
      status: "Claiming Laura Marshall's shift · awaiting approval",
      body: `Thomas would work ${DAY_FULL}.`,
      asked: `Offered ${AT}.`,
    });
  });

  it("describes a named pickup while the teammate answers and once a manager decides", () => {
    const asked = texts(request({ ...thomas, absenceTypeId: 4 }));
    expect(asked[L]).toEqual({
      status: "Asked Thomas Crawford to pick up · waiting for Thomas",
      body: "If accepted and approved, Thomas works Laura's Day Shift · Supervisor and Laura is Off.",
      asked: `Asked ${AT}.`,
    });
    expect(asked[T]).toMatchObject({
      status: "Asked by Laura Marshall to pick up · waiting for Thomas",
      body: `If accepted and approved, Thomas works Laura's ${DAY_FULL} and Laura is Off.`,
    });
    const accepted = texts(request({ status: "pending_approval", ...thomas, absenceTypeId: 4 }));
    expect(accepted[L]?.status).toBe("Pickup by Thomas Crawford · awaiting approval");
    expect(accepted[T]).toMatchObject({
      status: "Picking up Laura Marshall's shift · awaiting approval",
      body: `If approved, Thomas works Laura's ${DAY_FULL} and Laura is Off.`,
    });
  });

  it("describes a volunteer for an open shift", () => {
    expect(texts(request({ status: "pending_approval" }))[L]).toEqual({
      status: "Volunteered for an open shift · awaiting approval",
      body: `Laura would work ${DAY_FULL}.`,
      asked: `Volunteered ${AT}.`,
    });
  });

  it("describes a same-day swap from each side", () => {
    const out = texts(
      request({
        type: "swap",
        ...thomas,
        targetName: "Thomas Crawford",
        targetState: worked(6),
      }),
    );
    expect(out[L]).toEqual({
      status: "Swap with Thomas Crawford · waiting for Thomas",
      body:
        "Laura would work Thomas's Evening Shift · Supervisor · Skilled Nursing · " +
        "Thu 3:30 PM - Fri 12:00 AM (8.5 hrs). Thomas would work Laura's Day Shift · Supervisor.",
      asked: `Asked ${AT}.`,
    });
    expect(out[T]?.body).toBe(
      `Thomas would work Laura's ${DAY_FULL}. Laura would work Thomas's Evening Shift · Supervisor.`,
    );
    expect(out[T]?.status).toBe("Swap with Laura Marshall · waiting for Thomas");
  });

  it("names both days of a swap across two dates", () => {
    const out = texts(
      request({
        type: "swap",
        status: "pending_approval",
        requesterEmpId: "diane",
        requesterName: "Diane Patterson",
        requesterShiftDate: "2026-11-17",
        targetEmpId: "carol",
        targetName: "Carol Henderson",
        targetShiftDate: "2026-11-19",
        targetState: worked(6),
      }),
    );
    expect(out["diane_2026-11-17"]?.body).toBe(
      "Diane would work Carol's Evening Shift · Supervisor · Skilled Nursing · " +
        "Thu 3:30 PM - Fri 12:00 AM (8.5 hrs) on Thu, Nov 19. Carol would work Diane's Day Shift · Supervisor.",
    );
    expect(out["carol_2026-11-19"]?.body).toBe(
      `Carol would work Diane's ${DAY_FULL} on Tue, Nov 17. Diane would work Carol's Evening Shift · Supervisor.`,
    );
  });

  it("describes a call-off", () => {
    expect(
      texts(request({ type: "calloff", status: "pending_approval", absenceTypeId: 9 }))[L],
    ).toEqual({
      status: "Call-off (Sick) · awaiting approval",
      body: "If approved, Laura is marked Sick and the Day Shift · Supervisor opens for pickup.",
      asked: `Called off ${AT}.`,
    });
  });

  it("describes a claimed call-off open shift in the row and on the claimer's day", () => {
    const out = texts(
      request({ id: "open-1", parentRequestId: "call-1", status: "pending_approval", ...thomas }),
    );
    expect(out["open:open-1"]).toEqual({
      status: "Claimed by Thomas Crawford · awaiting approval",
      body: "If approved, Thomas works this shift.",
      asked: `Opened ${AT}.`,
    });
    expect(out[T]).toEqual({
      status: "Claiming Laura Marshall's shift · awaiting approval",
      body: `Thomas would work ${DAY_FULL}.`,
      asked: `Opened ${AT}.`,
    });
  });

  it("names only the offered shift of a day with two", () => {
    // A request stores just the segment offered, even from a double.
    const out = texts(
      request({ status: "pending_approval", ...thomas, requesterState: worked(6) }),
    );
    expect(out[L]?.body).toBe("If approved, Thomas works Laura's Evening Shift · Supervisor.");
    expect(out[T]?.body).toBe(
      "Thomas would work Evening Shift · Supervisor · Skilled Nursing · Thu 3:30 PM - Fri 12:00 AM (8.5 hrs).",
    );
  });
});
