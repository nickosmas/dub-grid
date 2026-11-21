import type { ViewStyle } from "react-native";
import { mobileRadii, type MobileColors } from "../theme/tokens";

/** How far a picked row's pill stands in from the card that holds it. */
const CARD_INSET = 6;

/**
 * The row a split view's detail pane shows: a gray pill with rounded corners,
 * the web sidebar's active item. A row inside a section card passes its own
 * padding: the pill then stands in from the card by the same distance on
 * every side, its corners follow the card's, and the row's text stays where
 * it was. A row that already bleeds past its gutter (People, Schedule) passes
 * none.
 */
export function splitSelectedRowStyle(
  mobileColors: MobileColors,
  rowPadding?: { horizontal: number; vertical: number; minHeight?: number },
): ViewStyle {
  if (!rowPadding) {
    return { backgroundColor: mobileColors.selectedRowBg, borderRadius: mobileRadii.control };
  }
  return {
    backgroundColor: mobileColors.selectedRowBg,
    borderRadius: mobileRadii.card - CARD_INSET,
    margin: CARD_INSET,
    paddingHorizontal: rowPadding.horizontal - CARD_INSET,
    paddingVertical: rowPadding.vertical - CARD_INSET,
    ...(rowPadding.minHeight != null ? { minHeight: rowPadding.minHeight - 2 * CARD_INSET } : null),
  };
}
