import type { RequestWaitingOn, ScheduleCellState, ShiftRequest, ShiftRequestType } from "@/types";

/** Who has to act next on a waiting request. */
export type RequestMarkWaitingOn = RequestWaitingOn;

export type RequestMarkRole =
  /** The requester's own shift. */
  | "asker"
  /** A swap's other side, or the teammate a named pickup asks. */
  | "partner"
  /** Took an offered pickup or a call-off's open shift. */
  | "claimer"
  /** Volunteered for a coverage-gap open shift. */
  | "volunteer"
  /** A call-off's open shift in the Open shifts row, once claimed. */
  | "open-shift";

/** One waiting request as it touches one day (or one open shift). Read by 57c too. */
export interface RequestCellMark {
  requestId: string;
  type: ShiftRequestType;
  role: RequestMarkRole;
  waitingOn: RequestMarkWaitingOn;
  /** The shift this person would get, for the dashed outline; null when they would get nothing new. */
  wouldGet: ScheduleCellState | null;
}

export interface RequestMarks {
  /** Keyed `${empId}_${dateKey}`, the grid's cell key. */
  byCell: Map<string, RequestCellMark[]>;
  /** Keyed by the call-off open shift's request id (`GridOpenShift.requestId`). */
  byOpenShift: Map<string, RequestCellMark>;
}

export const NO_REQUEST_MARKS: RequestMarks = { byCell: new Map(), byOpenShift: new Map() };

function waitingOnFor(status: ShiftRequest["status"]): RequestMarkWaitingOn | null {
  if (status === "open") return "teammate";
  if (status === "pending_approval") return "manager";
  return null;
}

/**
 * Every day a waiting request touches, and who acts next on it. Only open and
 * awaiting-approval requests mark anything; a settled request (approved,
 * declined, cancelled or expired) leaves no mark here.
 */
export function buildRequestMarks(requests: readonly ShiftRequest[]): RequestMarks {
  const byCell = new Map<string, RequestCellMark[]>();
  const byOpenShift = new Map<string, RequestCellMark>();
  const add = (empId: string | null, date: string | null, mark: RequestCellMark) => {
    if (!empId || !date) return;
    const key = `${empId}_${date}`;
    const list = byCell.get(key);
    if (list) list.push(mark);
    else byCell.set(key, [mark]);
  };

  for (const request of requests) {
    const waitingOn = waitingOnFor(request.status);
    if (!waitingOn) continue;
    const base = { requestId: request.id, type: request.type, waitingOn };
    const askerDate = request.requesterShiftDate;
    const partnerDate = request.targetShiftDate ?? request.requesterShiftDate;

    if (request.type === "calloff") {
      add(request.requesterEmpId, askerDate, { ...base, role: "asker", wouldGet: null });
      continue;
    }

    if (request.type === "swap") {
      add(request.requesterEmpId, askerDate, {
        ...base,
        role: "asker",
        wouldGet: request.targetState ?? null,
      });
      add(request.targetEmpId, partnerDate, {
        ...base,
        role: "partner",
        wouldGet: request.requesterState,
      });
      continue;
    }

    // A call-off's own open shift: unclaimed it is simply an open shift.
    if (request.parentRequestId != null) {
      if (request.targetEmpId == null) continue;
      byOpenShift.set(request.id, { ...base, role: "open-shift", wouldGet: null });
      add(request.targetEmpId, partnerDate, {
        ...base,
        role: "claimer",
        wouldGet: request.requesterState,
      });
      continue;
    }

    if (request.targetEmpId == null) {
      // Offered and unclaimed, or a volunteer asking for a coverage-gap shift.
      if (request.status === "open") {
        add(request.requesterEmpId, askerDate, { ...base, role: "asker", wouldGet: null });
      } else {
        add(request.requesterEmpId, askerDate, {
          ...base,
          role: "volunteer",
          wouldGet: request.requesterState,
        });
      }
      continue;
    }

    // A named pickup carries the absence the asker would take; a claim does not.
    const named = request.absenceTypeId != null || request.status === "open";
    add(request.requesterEmpId, askerDate, { ...base, role: "asker", wouldGet: null });
    add(request.targetEmpId, partnerDate, {
      ...base,
      role: named ? "partner" : "claimer",
      wouldGet: request.requesterState,
    });
  }

  // A manager's turn comes first on a day in several requests.
  for (const list of byCell.values()) {
    list.sort((left, right) =>
      left.waitingOn === right.waitingOn ? 0 : left.waitingOn === "manager" ? -1 : 1,
    );
  }
  return { byCell, byOpenShift };
}

/** The fold a day shows: amber when any of its requests waits for a manager. */
export function foldWaitingOn(
  marks: readonly RequestCellMark[] | undefined,
): RequestMarkWaitingOn | null {
  if (!marks || marks.length === 0) return null;
  return marks.some((mark) => mark.waitingOn === "manager") ? "manager" : "teammate";
}
