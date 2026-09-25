import {
  describeCancelAwaitingRecipientCaution,
  describeShiftRequestSubmitted,
  isAwaitingRecipient,
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
};

export type MobileRequestActionFeedback = {
  confirmLabel: string;
  confirmStyle?: "default" | "destructive";
  key: string;
  message: string;
  title: string;
};

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
    ? "Claim this open shift? As an admin, this goes on the schedule right away."
    : "Claim this open shift? We'll send it to your admin for approval.";

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
        message:
          "Accept this coverage request? The request will move forward for manager review if approval is required.",
        title: "Accept request?",
      };
    case "decline":
      return {
        confirmLabel: "Decline",
        confirmStyle: "destructive",
        key,
        message:
          "Decline this coverage request? The requester will keep their current shift unless another response is submitted.",
        title: "Decline request?",
      };
    case "approve":
      return {
        confirmLabel: "Approve",
        key,
        message: "Approve this request? This will finalize the staffing change.",
        title: "Approve request?",
      };
    case "reject":
      return {
        confirmLabel: "Reject",
        confirmStyle: "destructive",
        key,
        message: "Reject this request? The original schedule will stay in place.",
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
            ? describeCancelAwaitingRecipientCaution(request)
            : "Cancel this request? It will no longer be available for review.",
        title: "Cancel request?",
      };
    default:
      return {
        confirmLabel: "Confirm",
        key,
        message: "Confirm this request action?",
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
