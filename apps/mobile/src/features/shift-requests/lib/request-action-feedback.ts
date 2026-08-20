export type MobileRequestActionBody = {
  action: string;
  accept?: boolean;
  approved?: boolean;
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
}: {
  requestId: string;
  body: MobileRequestActionBody;
}): MobileRequestActionFeedback {
  const key = getMobileRequestActionKey(requestId, body);

  switch (getActionVariant(body)) {
    case "volunteer_open_shift":
      return {
        confirmLabel: "Volunteer",
        key,
        message: "Volunteer for this open shift? This will be sent to your admin for approval.",
        title: "Volunteer for open shift?",
      };
    case "claim":
      return {
        confirmLabel: "Claim shift",
        key,
        message: "Claim this open shift? This will be sent to your admin for approval.",
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
        message: "Cancel this request? It will no longer be available for review.",
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
): MobileRequestActionSuccessToast {
  switch (getActionVariant(body)) {
    case "volunteer_open_shift":
      return {
        title: "Volunteer request sent",
        message: "Your shift is pending approval.",
      };
    case "claim":
      return {
        title: "Claim request sent",
        message: "Your shift is pending approval.",
      };
    case "accept":
      return {
        title: "Request accepted",
        message: "Your response was sent.",
      };
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
