/**
 * A request's stored note (`shift_requests.admin_note`): a manager's own words,
 * or a reason the database recorded when it settled the request by itself.
 * Only the first is a manager note; the second reads as what happened.
 */
export type ShiftRequestNote = { kind: "manager"; text: string } | { kind: "system"; text: string };

// The exact reasons the database writes (migrations 117 and 135).
const SYSTEM_REASONS: Record<string, string> = {
  "Auto-cancelled: shift was called off": "Canceled automatically: the shift was called off.",
  "Auto-cancelled: open shift was taken by another approved volunteer":
    "Canceled automatically: someone else was approved for this open shift.",
  "Auto-cancelled: shift was reassigned by another approved request":
    "Canceled automatically: another approved request changed this shift.",
  "Assigned through the published schedule":
    "Approved automatically: the shift was assigned on the schedule.",
};

const AUTO_APPROVED = /^Auto-approved: (.+) can approve shift requests$/;
const AUTO_PREFIX = /^Auto-(cancelled|approved): (.+)$/;

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function readShiftRequestNote(note: string | null | undefined): ShiftRequestNote | null {
  const text = note?.trim();
  if (!text) return null;
  const known = SYSTEM_REASONS[text];
  if (known) return { kind: "system", text: known };
  const approver = AUTO_APPROVED.exec(text);
  if (approver) {
    return {
      kind: "system",
      text: `Approved automatically: ${approver[1]} accepted and can approve requests.`,
    };
  }
  const other = AUTO_PREFIX.exec(text);
  if (other) {
    const outcome = other[1] === "cancelled" ? "Canceled" : "Approved";
    return { kind: "system", text: `${outcome} automatically: ${sentence(other[2] ?? "")}` };
  }
  return { kind: "manager", text };
}

/** The note as one line: "Manager note: ..." for a manager's words, the reason alone otherwise. */
export function formatShiftRequestNote(note: string | null | undefined): string | null {
  const read = readShiftRequestNote(note);
  if (!read) return null;
  return read.kind === "manager" ? `Manager note: ${read.text}` : read.text;
}

/** A manager's own words, or null when the note is a recorded reason or empty. */
export function managerNoteOf(note: string | null | undefined): string | null {
  const read = readShiftRequestNote(note);
  return read?.kind === "manager" ? read.text : null;
}
