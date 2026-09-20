import type { ShiftRequestStatus, ShiftRequestType } from "./requests";

// Shared by the web request board and the mobile Requests tab, which both
// render the same card and must say the same thing about it.
export type ShiftRequestCopyInput = {
  type: ShiftRequestType;
  requesterEmpId: string;
  requesterName: string;
  targetEmpId: string | null;
  targetName: string | null;
};

export type ShiftRequestCopy = {
  /** Who asked: their name, or "You" when the viewer did. */
  title: string;
  /** What they asked, as one sentence under the title. */
  subtitle: string;
  /** Labels for the requester's and the target's shift panels. */
  requesterShiftLabel: string;
  targetShiftLabel: string | null;
};

function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

/**
 * The card used to lead with the requester's name and nothing else, so who
 * asked whom was implied by which name came first. This spells it out, and
 * says "you" wherever the viewer is one of the two people.
 */
export function describeShiftRequest(
  request: ShiftRequestCopyInput,
  viewerEmpId: string | null,
): ShiftRequestCopy {
  const requesterIsViewer = viewerEmpId != null && request.requesterEmpId === viewerEmpId;
  const targetIsViewer = viewerEmpId != null && request.targetEmpId === viewerEmpId;
  const requester = requesterIsViewer ? "You" : request.requesterName;
  const target = targetIsViewer ? "you" : request.targetName;

  const requesterShiftLabel = requesterIsViewer ? "Your shift" : `${possessive(requester)} shift`;
  const targetShiftLabel =
    target == null ? null : targetIsViewer ? "Your shift" : `${possessive(target)} shift`;

  let subtitle: string;
  if (request.type === "swap") {
    subtitle = target ? `Asked ${target} to swap shifts` : "Asked to swap shifts";
  } else if (request.type === "calloff") {
    subtitle = "Asked for time off";
  } else if (target) {
    subtitle = `Offered to cover ${targetIsViewer ? "your" : possessive(target)} shift`;
  } else {
    subtitle = "Offered this shift for pickup";
  }

  return { title: requester, subtitle, requesterShiftLabel, targetShiftLabel };
}

export type ShiftRequestPillTone = "kind" | "pending" | "approved" | "closed";

export type ShiftRequestPill = {
  label: string;
  /** `kind` while open; otherwise the status decides the colour. */
  tone: ShiftRequestPillTone;
};

const KIND_LABEL: Record<ShiftRequestCopyInput["type"], string> = {
  pickup: "Pickup",
  swap: "Swap",
  calloff: "Time off",
};

const STATUS_LABEL: Record<Exclude<ShiftRequestStatus, "open">, string> = {
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
};

/**
 * The one pill a request card carries. While open it names the kind, beside
 * the open-shift card's "Open shift"; once the request is waiting or decided
 * it says both, so the status is never a second pill.
 */
export function describeShiftRequestPill(
  type: ShiftRequestCopyInput["type"],
  status: ShiftRequestStatus,
): ShiftRequestPill {
  if (status === "open") {
    return { label: `${KIND_LABEL[type]} request`, tone: "kind" };
  }

  const tone: ShiftRequestPillTone =
    status === "pending_approval" ? "pending" : status === "approved" ? "approved" : "closed";

  return { label: `${KIND_LABEL[type]} · ${STATUS_LABEL[status]}`, tone };
}

/**
 * Who reads a manager's note: the requester, and on a swap or claimed pickup
 * the other person too. First names only, so it fits a field placeholder.
 */
export function describeShiftRequestNoteRecipients(
  request: Pick<ShiftRequestCopyInput, "requesterName" | "targetName">,
): string {
  const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
  return request.targetName
    ? `${first(request.requesterName)} and ${first(request.targetName)}`
    : first(request.requesterName);
}
