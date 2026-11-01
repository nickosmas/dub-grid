import { Button } from "./Button";
import type { BarActionProps } from "./sheet-bar-actions";

/**
 * The web build and the tests keep sheet actions in the footer, so a bar
 * action there is the footer's own button. iOS and Android draw it in the
 * bar (`SheetBarAction.native.tsx`).
 */
export function BarAction({ action }: BarActionProps) {
  return <Button {...action} />;
}
