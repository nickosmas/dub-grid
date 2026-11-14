import {
  cellStateToChangeDay,
  describeShiftChangeItem,
  type ShiftChangeResolvers,
} from "@dubgrid/schedule-core";
import { publishedAtFormatter } from "@/components/schedule-grid/gridHelpers";
import type { ScheduleCellState, ShiftRequest } from "@/types";
import type { RequestCellMark } from "./request-marks";

export interface RequestMarkText {
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
export function describeRequestMark(args: {
  mark: RequestCellMark;
  request: ShiftRequest;
  resolvers: ShiftChangeResolvers;
  timeZone?: string | null;
}): RequestMarkText {
  const { mark, request, resolvers, timeZone } = args;
  const asker = request.requesterName;
  const other = request.targetName ?? "a teammate";
  const askerFirst = firstName(asker);
  const otherFirst = firstName(request.targetName);
  const waiting = (teammate: string) =>
    mark.waitingOn === "manager" ? "awaiting approval" : `waiting for ${teammate}`;
  const at = publishedAtFormatter(timeZone).format(new Date(request.createdAt));
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
