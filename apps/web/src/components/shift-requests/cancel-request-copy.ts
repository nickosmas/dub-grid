import { isAwaitingRecipient } from "@dubgrid/domain";
import type { ShiftRequest } from "@/types";

export interface CancelRequestConfirmation {
  message?: string;
  points?: string[];
}

/**
 * What the cancel confirmation says under its title, shared by the request
 * board and the shift panel. Cancelling over an unanswered recipient's head
 * gets the caution; anything else needs none.
 */
export function describeCancelRequestConfirmation(
  request: Pick<ShiftRequest, "type" | "status" | "targetEmpId">,
): CancelRequestConfirmation {
  if (!isAwaitingRecipient(request)) return {};
  return {
    message: `The other person hasn't responded to this ${request.type === "swap" ? "swap" : "pickup"} yet.`,
    points: ["The request is withdrawn for both people.", "Nothing on the schedule changes."],
  };
}
