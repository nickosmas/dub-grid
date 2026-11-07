import {
  cellStateToChangeDay,
  describeShiftChangeItem,
  type ShiftChangeResolvers,
} from "@dubgrid/schedule-core";
import { formatEmailDateTime } from "@/emails/email-time";
import type { NotificationEmailDetail } from "@/emails/NotificationEmail";
import { dayLabel, readCellState } from "./shift-change-alert";

export interface RequestEmailFacts {
  type: "pickup" | "swap" | "calloff";
  requesterName: string;
  requesterUserId: string | null;
  targetName: string | null;
  targetUserId: string | null;
  requesterDate: string | null;
  requesterState: unknown;
  targetDate: string | null;
  targetState: unknown;
  absenceName: string | null;
  expiresAt: string | null;
  timeZone: string;
  /** Null when the organization's names couldn't be read; the date still shows. */
  resolvers: ShiftChangeResolvers | null;
}

/** "Thu, Nov 13 · Day Shift · Registered Nurse · 7:00 AM - 3:00 PM (8 hrs) · Memory Care" */
function shiftLine(date: string, state: unknown, resolvers: ShiftChangeResolvers | null): string {
  const label = dayLabel(date);
  const cell = readCellState(state);
  if (!cell || !resolvers) return label;
  const items = cellStateToChangeDay(cell, resolvers).items.map(
    (item) => describeShiftChangeItem(item, { date }).plain,
  );
  return items.length > 0 ? `${label} · ${items.join(" + ")}` : label;
}

/**
 * The facts of a shift request for its email, from the reader's side. Why
 * someone called off goes to approvers and the person themself, never to
 * whoever is picking the shift up.
 */
export function requestEmailDetails(
  facts: RequestEmailFacts,
  options: {
    viewer: "approver" | "requester" | "target";
    /** An approver's own account, since an approver can be on the request. */
    readerUserId?: string;
    /** Still waiting on an answer, so the deadline matters. */
    waiting?: boolean;
    note?: string;
  },
): NotificationEmailDetail[] {
  const { viewer, readerUserId, waiting = false, note } = options;
  const isRequester =
    viewer === "requester" || (readerUserId != null && readerUserId === facts.requesterUserId);
  const isTarget =
    viewer === "target" || (readerUserId != null && readerUserId === facts.targetUserId);
  const details: NotificationEmailDetail[] = [];
  if (facts.requesterDate) {
    details.push({
      label: isRequester ? "Your shift" : `${facts.requesterName}'s shift`,
      value: shiftLine(facts.requesterDate, facts.requesterState, facts.resolvers),
    });
  }
  if (facts.type === "swap" && facts.targetDate) {
    details.push({
      label: isTarget
        ? "Your shift"
        : facts.targetName
          ? `${facts.targetName}'s shift`
          : "Their shift",
      value: shiftLine(facts.targetDate, facts.targetState, facts.resolvers),
    });
  }
  if (facts.type === "pickup" && facts.targetName && viewer === "approver") {
    details.push({ label: "Picking up", value: isTarget ? "You" : facts.targetName });
  }
  if (facts.absenceName && viewer !== "target") {
    details.push({ label: "Absence", value: facts.absenceName });
  }
  if (waiting && facts.expiresAt) {
    details.push({
      label: "Expires",
      value: formatEmailDateTime(facts.expiresAt, facts.timeZone),
    });
  }
  if (note) details.push({ label: "Manager's note", value: note });
  return details;
}
