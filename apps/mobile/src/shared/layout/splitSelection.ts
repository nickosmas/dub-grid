import type { ViewStyle } from "react-native";
import type { MobileColors } from "../theme/tokens";

/**
 * The fill of the row a split view's detail pane shows. A clear blue, so the
 * eye finds it from across the screen; the faint tint it replaced was lost on
 * the page's gray.
 */
export function splitSelectedRowStyle(mobileColors: MobileColors): ViewStyle {
  return { backgroundColor: mobileColors.brandBorder };
}
