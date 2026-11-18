import type { ScheduleCellState } from "@dubgrid/contracts";
import { cellStateToChangeDay, type ShiftChangeResolvers } from "./shift-change-input";
import { describeShiftChangeItem } from "./shift-change";

/** Who has to act next on a waiting request. */
export type RequestTextWaitingOn = "teammate" | "manager";

/** Which side of a request a day (or an open shift) is on. */
export type RequestTextRole = "asker" | "partner" | "claimer" | "volunteer" | "open-shift";

/** The side being described and who acts next. */
export interface RequestTextMark {
  role: RequestTextRole;
  waitingOn: RequestTextWaitingOn;
}

/** The fields of a shift request the text reads; web and mobile requests both carry them. */
export interface RequestTextRequest {
  type: "pickup" | "swap" | "calloff";
  status: string;
  requesterName: string;
  requesterShiftDate: string;
  requesterState: ScheduleCellState | null | undefined;
  targetEmpId: string | null;
  targetName: string | null;
  targetShiftDate: string | null;
  targetState?: ScheduleCellState | null;
  absenceTypeId: number | null;
  parentRequestId: string | null;
  createdAt: string;
}

export interface RequestText {
  /** "Swap with Carol Henderson · awaiting approval" */
  status: string;
  /** What would happen, in full; null when the status already says it all. */
  body: string | null;
  /** When the request was made. Requests don't store when it was accepted or claimed. */
  asked: string;
}

const firstName = (name: string | null) => (name ?? "").trim().split(/\s+/)[0] || "They";

function shiftText(
  state: ScheduleCellState | null | undefined,
  date: string,
  resolvers: ShiftChangeResolvers,
): string {
  const items = cellStateToChangeDay(state, resolvers).items;
  if (items.length === 0) return "nothing";
  return items.map((item) => describeShiftChangeItem(item, { date }).plain).join(" + ");
}

/** Just the shift and job ("Day Shift · Supervisor"), for a day whose times are already on screen. */
function shiftTitle(
  state: ScheduleCellState | null | undefined,
  date: string,
  resolvers: ShiftChangeResolvers,
): string {
  const items = cellStateToChangeDay(state, resolvers).items;
  if (items.length === 0) return "nothing";
  return items
    .map((item) =>
      describeShiftChangeItem(item, { date })
        .title.map((part) => part.text)
        .join(""),
    )
    .join(" + ");
}

function onDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * The hover card and panel text for one waiting request as it touches one day.
 * Every name, shift and time comes from the request itself.
 */
export function describeRequestText(args: {
  mark: RequestTextMark;
  request: RequestTextRequest;
  resolvers: ShiftChangeResolvers;
  /** Formats when it was asked, in the organization's time zone. */
  formatAsked: (date: Date) => string;
}): RequestText {
  const { mark, request, resolvers, formatAsked } = args;
  const asker = request.requesterName;
  const other = request.targetName ?? "a teammate";
  const askerFirst = firstName(asker);
  const otherFirst = firstName(request.targetName);
  const waiting = (teammate: string) =>
    mark.waitingOn === "manager" ? "awaiting approval" : `waiting for ${teammate}`;
  const at = formatAsked(new Date(request.createdAt));
  const askerShift = shiftText(request.requesterState, request.requesterShiftDate, resolvers);
  // On the asker's own day the times are already shown; the name says which shift on a day with two.
  const askerShiftName = `${askerFirst}'s ${shiftTitle(request.requesterState, request.requesterShiftDate, resolvers)}`;
  const absence =
    request.absenceTypeId != null
      ? (resolvers.absenceType(request.absenceTypeId)?.name ?? "absent")
      : "absent";

  if (request.type === "calloff") {
    return {
      status: `Call-off (${absence}) · awaiting approval`,
      // Named, since a day can hold two shifts and only one may be called off.
      body: `If approved, ${askerFirst} is marked ${absence} and the ${shiftTitle(request.requesterState, request.requesterShiftDate, resolvers)} opens for pickup.`,
      asked: `Called off ${at}.`,
    };
  }

  if (request.type === "swap") {
    const partnerDate = request.targetShiftDate ?? request.requesterShiftDate;
    const crossDate = partnerDate !== request.requesterShiftDate;
    const partnerShift = shiftText(request.targetState, partnerDate, resolvers);
    const askerOn = crossDate ? ` on ${onDay(request.requesterShiftDate)}` : "";
    const partnerOn = crossDate ? ` on ${onDay(partnerDate)}` : "";
    // The day's own shift is already on screen beside this text; name only the other side.
    const body =
      mark.role === "asker"
        ? `${askerFirst} would work ${otherFirst}'s ${partnerShift}${partnerOn}. ` +
          `${otherFirst} would work ${askerShiftName}.`
        : `${otherFirst} would work ${askerFirst}'s ${askerShift}${askerOn}. ` +
          `${askerFirst} would work ${otherFirst}'s ${shiftTitle(request.targetState, partnerDate, resolvers)}.`;
    return {
      status: `Swap with ${mark.role === "asker" ? other : asker} · ${waiting(otherFirst)}`,
      body,
      asked: `Asked ${at}.`,
    };
  }

  // Pickups.
  if (mark.role === "volunteer") {
    return {
      status: "Volunteered for an open shift · awaiting approval",
      body: `${askerFirst} would work ${askerShift}.`,
      asked: `Volunteered ${at}.`,
    };
  }
  if (mark.role === "open-shift") {
    return {
      status: `Claimed by ${other} · awaiting approval`,
      body: `If approved, ${otherFirst} works this shift.`,
      asked: `Opened ${at}.`,
    };
  }
  if (request.targetEmpId == null) {
    return {
      status: "Offered for pickup · waiting for a teammate",
      body: `${askerFirst} keeps this shift until a claim is approved.`,
      asked: `Offered ${at}.`,
    };
  }

  const named = request.absenceTypeId != null || request.status === "open";
  if (named) {
    const shift = mark.role === "asker" ? askerShiftName : `${askerFirst}'s ${askerShift}`;
    const outcome = `${otherFirst} works ${shift} and ${askerFirst} is ${absence}.`;
    const status =
      mark.role === "asker"
        ? mark.waitingOn === "manager"
          ? `Pickup by ${other} · awaiting approval`
          : `Asked ${other} to pick up · waiting for ${otherFirst}`
        : mark.waitingOn === "manager"
          ? `Picking up ${asker}'s shift · awaiting approval`
          : `Asked by ${asker} to pick up · waiting for ${otherFirst}`;
    return {
      status,
      body: `${mark.waitingOn === "manager" ? "If approved" : "If accepted and approved"}, ${outcome}`,
      asked: `Asked ${at}.`,
    };
  }

  // An offered shift someone claimed.
  return mark.role === "asker"
    ? {
        status: `Claimed by ${other} · awaiting approval`,
        body: `If approved, ${otherFirst} works ${askerShiftName}.`,
        asked: `Offered ${at}.`,
      }
    : {
        status: `Claiming ${asker}'s shift · awaiting approval`,
        body: `${otherFirst} would work ${askerShift}.`,
        // A call-off's open shift was opened when the call-off was approved.
        asked: request.parentRequestId != null ? `Opened ${at}.` : `Offered ${at}.`,
      };
}

/** The request fields that decide whose side a viewer reads. */
export interface RequestViewerRequest extends RequestTextRequest {
  requesterEmpId: string;
}

function waitingOnFor(status: string): RequestTextWaitingOn | null {
  if (status === "open") return "teammate";
  if (status === "pending_approval") return "manager";
  return null;
}

/**
 * The side of a waiting request a viewer reads on its page: the teammate it
 * asks reads their own side, as the web's grid shows it on their day; the
 * asker and an approver read the asker's side. Null once the request is
 * settled, when there is nothing left to happen.
 */
export function requestTextMarkFor(
  request: RequestViewerRequest,
  viewerEmpId: string | null,
): RequestTextMark | null {
  const waitingOn = waitingOnFor(request.status);
  if (!waitingOn) return null;

  const isTarget = viewerEmpId !== null && viewerEmpId === request.targetEmpId;
  if (request.type === "swap") return { role: isTarget ? "partner" : "asker", waitingOn };
  if (request.type === "calloff") return { role: "asker", waitingOn };

  if (request.targetEmpId == null) {
    // Offered and unclaimed reads as the offer; a volunteer's ask as theirs.
    return { role: request.status === "open" ? "asker" : "volunteer", waitingOn };
  }
  if (!isTarget) return { role: "asker", waitingOn };
  // A call-off's open shift or an offered shift is claimed; a named pickup asks.
  const named =
    request.parentRequestId == null && (request.absenceTypeId != null || request.status === "open");
  return { role: named ? "partner" : "claimer", waitingOn };
}

/** A waiting request's status, outcome and asked time for whoever reads its page. */
export function describeRequestForViewer(args: {
  request: RequestViewerRequest;
  viewerEmpId: string | null;
  resolvers: ShiftChangeResolvers;
  formatAsked: (date: Date) => string;
}): RequestText | null {
  const mark = requestTextMarkFor(args.request, args.viewerEmpId);
  if (!mark) return null;
  return describeRequestText({
    mark,
    request: args.request,
    resolvers: args.resolvers,
    formatAsked: args.formatAsked,
  });
}
