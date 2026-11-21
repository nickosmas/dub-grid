import type { ViewStyle } from "react-native";
import { mobileRadii, mobileSpace, type MobileColors } from "../theme/tokens";

/** How far a picked row's fill stands in from the list's edges. */
const SELECTED_ROW_INSET = mobileSpace.sm;

/**
 * The row a split view's detail pane shows, as People marks a person: a clear
 * blue pill with rounded corners. Pass the row's own horizontal padding to
 * stand the pill in from the list's edges with the text where it was; a row
 * that already bleeds past its gutter (People, Schedule) passes none.
 */
export function splitSelectedRowStyle(
  mobileColors: MobileColors,
  rowPaddingHorizontal?: number,
): ViewStyle {
  return {
    backgroundColor: mobileColors.brandBorder,
    borderRadius: mobileRadii.control,
    ...(rowPaddingHorizontal != null
      ? {
          marginHorizontal: SELECTED_ROW_INSET,
          paddingHorizontal: rowPaddingHorizontal - SELECTED_ROW_INSET,
        }
      : null),
  };
}
