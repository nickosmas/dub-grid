import {
  describeApprovalDraftWarning,
  describeShiftRequestSubmitted,
  isAwaitingRecipient,
  type ShiftRequestDraftCell,
} from "@dubgrid/domain";

export type MobileRequestActionBody = {
  action: string;
  accept?: boolean;
  approved?: boolean;
};

/** What the cancel confirmation needs to know about the request itself. */
export type MobileRequestActionSubject = {
  type: "pickup" | "swap" | "calloff";
  status: "open" | "pending_approval" | "approved" | "rejected" | "cancelled" | "expired";
  targetEmpId: string | null;
  targetName: string | null;
  requesterEmpId?: string;
  requesterName?: string;
  /** Absent when not checked; null when the check failed. */
  draftCells?: ShiftRequestDraftCell[] | null;
};

export type MobileRequestActionFeedback = {
  confirmLabel: string;
  confirmStyle?: "default" | "destructive";
  key: string;
  /** One to three sentences under the title: what confirming does. */
  message?: string;
  title: string;
  /** What approving would replace: shown before an approval, never after. */
  warning?: string[];
};

function approvalWarning(request: MobileRequestActionSubject | undefined): string[] {
  if (!request || request.draftCells === undefined || !request.requesterEmpId) return [];
  return describeApprovalDraftWarning(
    {
      requesterEmpId: request.requesterEmpId,
      requesterName: request.requesterName ?? "",
      targetEmpId: request.targetEmpId,
      targetName: request.targetName,
    },
    request.draftCells,
  );
}

export type MobileRequestActionSuccessToast = {
  message: string;
  title: string;
};

function getActionVariant(body: MobileRequestActionBody): string {
  if (body.action === "respond") {
    return body.accept === false ? "decline" : "accept";
  }

  if (body.action === "resolve") {
    return body.approved === false ? "reject" : "approve";
  }

  return body.action;
}

export function getMobileRequestActionKey(
  requestId: string,
  body: MobileRequestActionBody,
): string {
  return `${requestId}:${getActionVariant(body)}`;
}

export function getMobileRequestActionFeedback({
  requestId,
  body,
  request,
  viewerCanApprove = false,
}: {
  requestId: string;
  body: MobileRequestActionBody;
  request?: MobileRequestActionSubject;
  /** An approver's own claim is approved on the spot, so the confirm says so. */
  viewerCanApprove?: boolean;
}): MobileRequestActionFeedback {
  const key = getMobileRequestActionKey(requestId, body);
  const claimMessage = viewerCanApprove
    ? "As an admin, it goes on the schedule right away."
    : "It's sent to your admin for approval.";

  switch (getActionVariant(body)) {
    case "volunteer_open_shift":
      return {
        confirmLabel: "Claim",
        key,
        message: claimMessage,
        title: "Claim this shift?",
      };
    case "claim":
      return {
        confirmLabel: "Claim",
        key,
        message: claimMessage,
        title: "Claim this shift?",
      };
    case "accept":
      return {
        confirmLabel: "Accept",
        key,
        message: "It moves on to manager review if approval is required.",
        title: "Accept request?",
      };
    case "decline":
      return {
        confirmLabel: "Decline",
        confirmStyle: "destructive",
        key,
        message: "The requester keeps their current shift unless someone else responds.",
        title: "Decline request?",
      };
    case "approve":
      return {
        confirmLabel: "Approve",
        key,
        message: "This finalizes the staffing change.",
        title: "Approve request?",
        warning: approvalWarning(request),
      };
    case "reject":
      return {
        confirmLabel: "Reject",
        confirmStyle: "destructive",
        key,
        message: "The original schedule will stay in place.",
        title: "Reject request?",
      };
    case "cancel":
      return {
        confirmLabel: "Cancel request",
        confirmStyle: "destructive",
        key,
        // Cancelling over the recipient's head is the one case that needs a
        // caution: they were asked and have not answered yet.
        message:
          request && isAwaitingRecipient(request)
            ? `The other person hasn't responded to this ${request.type === "swap" ? "swap" : "pickup"} yet. Cancelling withdraws it for both people and the schedule stays as it is.`
            : "It will no longer be available for review.",
        title: "Cancel request?",
      };
    default:
      return {
        confirmLabel: "Confirm",
        key,
        title: "Confirm action?",
      };
  }
}

export function getMobileRequestActionSuccessToast(
  body: MobileRequestActionBody,
  result?: { autoApproved?: boolean },
): MobileRequestActionSuccessToast {
  const autoApproved = result?.autoApproved === true;
  switch (getActionVariant(body)) {
    case "volunteer_open_shift":
    case "claim":
      return describeShiftRequestSubmitted({ action: "claimed" }, { autoApproved });
    case "accept":
      return describeShiftRequestSubmitted({ action: "accepted", type: "swap" }, { autoApproved });
    case "decline":
      return {
        title: "Request declined",
        message: "Your response was sent.",
      };
    case "approve":
      return {
        title: "Request approved",
        message: "The staffing change was finalized.",
      };
    case "reject":
      return {
        title: "Request rejected",
        message: "The original schedule was kept.",
      };
    case "cancel":
      return {
        title: "Request canceled",
        message: "The request is no longer active.",
      };
    default:
      return {
        title: "Request updated",
        message: "Your change was completed.",
      };
  }
}
