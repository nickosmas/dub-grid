import type { ViewStyle } from "react-native";
import { mobileElevation, mobileRadii, type MobileColors } from "../theme/tokens";

/** Every icon-only chrome control is this size, and it is a real 44pt target. */
export const ICON_CONTROL_SIZE = 44;

/**
 * The app's outlined icon-button chrome: the schedule header's week chevrons
 * and alerts bell, and the close button on a sheet.
 *
 * A shared style rather than a shared component, because the three consumers
 * are shaped differently - the bell carries an unread badge, the sheet's close
 * button is absolutely positioned - and only the look has to agree.
 *
 * `border` rather than `borderSubtle`: the button is the same `surface` as the
 * bar or sheet it sits on, so the edge is the whole control, and at 1.23:1 the
 * subtle one leaves a 44pt target reading as a floating icon. `raised` rather
 * than `card` for the same reason in reverse: a 12pt blur under a white pill on
 * a white ground reads as a smudge, and with the outline there are already two
 * separators doing one job.
 */
export function createIconControlStyle(mobileColors: MobileColors, isDark: boolean): ViewStyle {
  return {
    width: ICON_CONTROL_SIZE,
    height: ICON_CONTROL_SIZE,
    borderRadius: mobileRadii.pill,
    borderWidth: 1,
    borderColor: mobileColors.border,
    backgroundColor: mobileColors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...mobileElevation("raised", isDark),
  };
}
