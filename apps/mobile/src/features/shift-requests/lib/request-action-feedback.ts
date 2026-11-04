import {
  describeApprovalDraftWarning,
  describeClaimApproval,
  describeShiftRequestDeclined,
  describeShiftRequestSubmitted,
  isAwaitingRecipient,
  SHIFT_REQUEST_DECLINE_MESSAGE,
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
  /** Set on the open pickup a call-off leaves behind. */
  parentRequestId?: string | null;
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

  switch (getActionVariant(body)) {
    case "volunteer_open_shift":
      return {
        confirmLabel: "Claim",
        key,
        // The volunteer posts a coverage gap's request themselves.
        message: describeClaimApproval({ viewerCanApprove, posterApprovalCounts: false }),
        title: "Claim this shift?",
      };
    case "claim":
      return {
        confirmLabel: "Claim",
        key,
        message: describeClaimApproval({
          viewerCanApprove,
          posterApprovalCounts: request?.parentRequestId == null,
        }),
        title: "Claim this shift?",
      };
    case "accept":
      return {
        confirmLabel: "Accept",
        key,
        message: "If approval is needed, a manager decides next.",
        title: "Accept request?",
      };
    case "decline":
      return {
        confirmLabel: "Decline",
        confirmStyle: "destructive",
        key,
        message: SHIFT_REQUEST_DECLINE_MESSAGE,
        title: "Decline request?",
      };
    case "approve":
      return {
        confirmLabel: "Approve",
        key,
        message: "It goes on the schedule right away.",
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

/** `requestType` is the answered request's type, when the caller knows it. */
export function getMobileRequestActionSuccessToast(
  body: MobileRequestActionBody,
  result?: { autoApproved?: boolean },
  requestType?: MobileRequestActionSubject["type"] | null,
): MobileRequestActionSuccessToast {
  const autoApproved = result?.autoApproved === true;
  const answeredType = requestType === "swap" || requestType === "pickup" ? requestType : null;
  switch (getActionVariant(body)) {
    case "volunteer_open_shift":
    case "claim":
      return describeShiftRequestSubmitted({ action: "claimed" }, { autoApproved });
    case "accept":
      return describeShiftRequestSubmitted(
        { action: "accepted", type: answeredType },
        { autoApproved },
      );
    case "decline":
      return describeShiftRequestDeclined(answeredType);
    case "approve":
      return {
        title: "Request approved",
        message: "It's on the schedule.",
      };
    case "reject":
      return {
        title: "Request rejected",
        message: "The schedule stays as it was.",
      };
    case "cancel":
      return {
        title: "Request canceled",
        message: "Nobody can respond to it now.",
      };
    default:
      return {
        title: "Request updated",
        message: "Your change is saved.",
      };
  }
}
