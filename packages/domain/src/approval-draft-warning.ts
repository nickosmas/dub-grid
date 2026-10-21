import type { ShiftRequestCopyInput } from "./shift-request-copy";

/** A day an approval would publish whose draft differs from what is published. */
export type ShiftRequestDraftCell = {
  empId: string;
  /** YYYY-MM-DD */
  date: string;
};

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

/**
 * The warning an approver reads before approving, one line per person with
 * unpublished changes on a day the approval publishes, then what approving
 * does to them. `null` cells means the check itself failed, which must still
 * warn rather than read as "nothing to replace".
 */
export function describeApprovalDraftWarning(
  request: ApprovalDraftWarningRequest,
  cells: ShiftRequestDraftCell[] | null,
): string[] {
  if (cells === null) {
    return [
      "These days couldn't be checked for unpublished changes. Approving publishes this request now and replaces any there are.",
    ];
  }
  if (cells.length === 0) return [];

  const people = [
    { empId: request.requesterEmpId, name: request.requesterName },
    ...(request.targetEmpId ? [{ empId: request.targetEmpId, name: request.targetName }] : []),
  ];
  const lines = people.flatMap(({ empId, name }) => {
    const days = cells
      .filter((cell) => cell.empId === empId)
      .map((cell) => cell.date)
      .sort()
      .map(formatDay);
    return days.length
      ? [`${name ?? "This person"} has unpublished changes on ${joinDays(days)}.`]
      : [];
  });

  return [...lines, "Approving publishes this request now and replaces those changes."];
}
