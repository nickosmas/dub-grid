// The requests involving one person (the staff page's Requests tab, item
// 55f): their pickups, swaps and call-offs, and their profile change requests.

import { formatShiftRequestStatusLabel } from "@dubgrid/domain";
import { formatShiftRequestTypeLabel } from "@/lib/client-facing";
import type { ProfileChangeRequest } from "@/features/account/client/api";
import type { ShiftJobSegment, ShiftRequest } from "@/types";

export type RequestTone = "warning" | "info" | "success" | "danger" | "neutral";

export interface PersonRequestRow {
  key: string;
  type: string;
  /** "Sat, Nov 8 · Evening Shift" */
  details: string;
  /** "with Margaret Sullivan", the changes asked for, or null. */
  secondary: string | null;
  /** ISO day the request was sent. */
  sentDate: string;
  state: string;
  tone: RequestTone;
  /** Who approved or rejected it, when known. */
  decidedBy: string | null;
  /** Still waiting on a manager. */
  waiting: boolean;
}

const DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatDay(date: string): string {
  return DAY.format(new Date(`${date}T00:00:00Z`));
}

function shiftNames(segments: ShiftJobSegment[] | null | undefined, fallback: string | null) {
  const names = (segments ?? [])
    .map((segment) => segment.shiftName)
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join(", ") : fallback;
}

const SHIFT_TONES: Record<string, RequestTone> = {
  pending_approval: "warning",
  open: "info",
  approved: "success",
  rejected: "danger",
};

const CHANGE_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  employmentType: "Employment",
  certificationId: "Certification",
  focusAreaIds: "Focus areas",
  roleIds: "Roles",
  departmentIds: "Departments",
};

const PROFILE_STATES: Record<ProfileChangeRequest["status"], { label: string; tone: RequestTone }> =
  {
    pending: { label: "Awaiting approval", tone: "warning" },
    approved: { label: "Approved", tone: "success" },
    rejected: { label: "Rejected", tone: "danger" },
    cancelled: { label: "Canceled", tone: "neutral" },
  };

/**
 * One list, newest first. `nameOfUser` turns a manager's user id into their
 * name; a decision by someone it can't name shows no decider.
 */
export function buildPersonRequestRows(
  employeeId: string,
  shiftRequests: readonly ShiftRequest[],
  profileRequests: readonly ProfileChangeRequest[],
  nameOfUser: (userId: string) => string | null,
  labels: { focusAreaLabel?: string } = {},
): PersonRequestRow[] {
  const rows: PersonRequestRow[] = [];

  for (const request of shiftRequests) {
    const isTarget = request.targetEmpId === employeeId && request.requesterEmpId !== employeeId;
    const ownDate = isTarget ? request.targetShiftDate : request.requesterShiftDate;
    const ownShift = isTarget
      ? shiftNames(request.targetSegments, request.targetShiftLabel)
      : shiftNames(request.requesterSegments, request.requesterShiftLabel);
    const other = isTarget ? request.requesterName : request.targetName;
    rows.push({
      key: `shift-${request.id}`,
      type: formatShiftRequestTypeLabel(request.type),
      details: [ownDate ? formatDay(ownDate) : null, ownShift].filter(Boolean).join(" · "),
      secondary: other ? (isTarget ? `from ${other}` : `with ${other}`) : null,
      sentDate: request.createdAt.slice(0, 10),
      state: formatShiftRequestStatusLabel(request.status),
      tone: SHIFT_TONES[request.status] ?? "neutral",
      decidedBy:
        request.adminUserId && (request.status === "approved" || request.status === "rejected")
          ? nameOfUser(request.adminUserId)
          : null,
      waiting: request.status === "pending_approval",
    });
  }

  for (const request of profileRequests) {
    if (request.requesterEmployeeId !== employeeId) continue;
    const changed = Object.keys(request.requestedChanges ?? {})
      .map((key) =>
        key === "focusAreaIds" && labels.focusAreaLabel
          ? labels.focusAreaLabel
          : CHANGE_LABELS[key],
      )
      .filter(Boolean);
    rows.push({
      key: `profile-${request.id}`,
      type: request.type === "account_deletion" ? "Account deletion" : "Profile change",
      details:
        request.type === "account_deletion"
          ? "Delete their account"
          : changed.join(", ") || "Profile",
      secondary: request.requestNote || null,
      sentDate: request.createdAt.slice(0, 10),
      state: PROFILE_STATES[request.status].label,
      tone: PROFILE_STATES[request.status].tone,
      decidedBy:
        request.resolverUserId && (request.status === "approved" || request.status === "rejected")
          ? nameOfUser(request.resolverUserId)
          : null,
      waiting: request.status === "pending",
    });
  }

  return rows.sort((a, b) => b.sentDate.localeCompare(a.sentDate) || a.key.localeCompare(b.key));
}

/** Rows sent inside a period. */
export function requestRowsInRange(
  rows: readonly PersonRequestRow[],
  range: { startDate: string; endDate: string },
): PersonRequestRow[] {
  return rows.filter((row) => row.sentDate >= range.startDate && row.sentDate <= range.endDate);
}
