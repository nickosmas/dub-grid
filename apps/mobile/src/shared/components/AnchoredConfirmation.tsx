import type { ReactElement } from "react";
import type { AnchoredConfirmationRequest } from "./anchored-confirmation";

/** iOS opens the confirmation from its button; elsewhere this is just the button. */
export function AnchoredConfirmation({
  children,
}: {
  request: AnchoredConfirmationRequest | null;
  children: ReactElement;
}) {
  return children;
}
