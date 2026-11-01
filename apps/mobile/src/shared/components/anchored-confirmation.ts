import { createContext } from "react";

export type AnchoredConfirmationRequest = {
  title: string;
  body?: string;
  confirmLabel: string;
  /** The way back out, such as Keep editing; the popover shows it as a button. */
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Set inside a native iOS sheet whose bar has a close button: a destructive
 * confirmation shown there opens from that button rather than as a centred
 * alert. Null everywhere else.
 */
export const AnchoredConfirmationContext = createContext<
  ((request: AnchoredConfirmationRequest | null) => void) | null
>(null);
