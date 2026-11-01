import type { ReactElement } from "react";
import type { AnchoredConfirmationRequest } from "./anchored-confirmation";

/** Whether a confirmation can open from the control that asked for it (iOS). */
export const CAN_ANCHOR_CONFIRMATION = false;

/** iOS opens the confirmation from its button; elsewhere this is just the button. */
export function AnchoredConfirmation({
  children,
}: {
  request: AnchoredConfirmationRequest | null;
  children: ReactElement;
}) {
  return children;
}
