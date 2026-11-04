import type { ShiftRequestCopyInput } from "./shift-request-copy";

/**
 * A day an approval would publish that holds unpublished changes: its shift
 * differs from what is published, or it has draft schedule notes.
 */
export type ShiftRequestDraftCell = {
  empId: string;
  /** YYYY-MM-DD */
  date: string;
  /** The shift differs from what is published. Absent from a server before 119: read as true. */
  hasShiftChanges?: boolean;
  /** The day has draft schedule notes, added or removed. Absent from a server before 119: false. */
  hasNoteChanges?: boolean;
};

/** A row of the shift_request_draft_cells function, as the database returns it. */
export type ShiftRequestDraftCellRow = {
  emp_id: string;
  shift_date: string;
  has_shift_changes?: boolean | null;
  has_note_changes?: boolean | null;
};

export function toShiftRequestDraftCell(row: ShiftRequestDraftCellRow): ShiftRequestDraftCell {
  return {
    empId: row.emp_id,
    date: row.shift_date,
    ...(row.has_shift_changes == null ? {} : { hasShiftChanges: row.has_shift_changes }),
    ...(row.has_note_changes == null ? {} : { hasNoteChanges: row.has_note_changes }),
  };
}

export type ApprovalDraftWarningRequest = Pick<
  ShiftRequestCopyInput,
  "requesterEmpId" | "requesterName" | "targetEmpId" | "targetName"
>;

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatDay(dateKey: string): string {
  return DAY_FORMAT.format(new Date(`${dateKey}T00:00:00Z`));
}

function joinDays(days: string[]): string {
  if (days.length <= 2) return days.join(" and ");
  return `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;
}

/** What a person's days hold: "changes", "notes", both on every day, or one or the other. */
function describeKinds(cells: ShiftRequestDraftCell[]): string {
  const shifts = cells.map((cell) => cell.hasShiftChanges ?? true);
  const notes = cells.map((cell) => cell.hasNoteChanges ?? false);
  if (!notes.some(Boolean)) return "changes";
  if (!shifts.some(Boolean)) return "notes";
  if (shifts.every(Boolean) && notes.every(Boolean)) return "changes and notes";
  return "changes or notes";
}

/**
 * The warning an approver reads before approving, one line per person with
 * unpublished changes or schedule notes on a day the approval publishes,
 * then what approving does to them. `null` cells means the check itself
 * failed, which must still warn rather than read as "nothing to replace".
 */
export function describeApprovalDraftWarning(
  request: ApprovalDraftWarningRequest,
  cells: ShiftRequestDraftCell[] | null,
): string[] {
  if (cells === null) {
    return [
      "These days couldn't be checked for unpublished changes or notes. Approving publishes this request now and replaces any there are.",
    ];
  }
  if (cells.length === 0) return [];

  const people = [
    { empId: request.requesterEmpId, name: request.requesterName },
    ...(request.targetEmpId ? [{ empId: request.targetEmpId, name: request.targetName }] : []),
  ];
  const lines = people.flatMap(({ empId, name }) => {
    const theirs = cells
      .filter((cell) => cell.empId === empId)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (theirs.length === 0) return [];
    const days = joinDays(theirs.map((cell) => formatDay(cell.date)));
    return [`${name ?? "This person"} has unpublished ${describeKinds(theirs)} on ${days}.`];
  });

  return [...lines, "Approving publishes this request now and replaces them."];
}
