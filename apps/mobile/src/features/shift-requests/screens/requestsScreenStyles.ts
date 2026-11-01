import { StyleSheet } from "react-native";
import { IS_NATIVE_LIST } from "../../../shared/lib/native-list";
import {
  mobilePillOverflow,
  mobileElevation,
  mobileRadii,
  mobileRadius,
  mobileSpace,
  mobileTabularText,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";

/**
 * The requests screen's stylesheet, split out of `RequestsScreen.tsx` for size.
 */
export const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    section: {
      gap: mobileSpace.md,
    },
    // The onboarding tour's Cover shifts preview still fronts its card with
    // the old date rail (`CoverShiftsPreview.tsx`); Requests itself heads each
    // day with a list header instead.
    dateGroupList: {
      gap: 0,
    },
    dateGroup: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: mobileSpace.md,
      paddingBottom: mobileSpace.lg,
    },
    dateRail: {
      alignItems: "center",
      gap: mobileSpace.xs,
    },
    dateRailLine: {
      flex: 1,
      width: 2,
      borderRadius: 999,
      backgroundColor: mobileColors.borderSubtle,
      marginBottom: -mobileSpace.lg + mobileSpace.xs,
    },
    dateGroupItems: {
      flex: 1,
      minWidth: 0,
      gap: mobileSpace.md,
    },
    groupItems: {
      gap: mobileSpace.md,
    },
    // One inset grouped card per request: the details, the shift and the
    // actions are rows of the same card, never a box inside it.
    requestCard: IS_NATIVE_LIST
      ? {
          backgroundColor: mobileColors.surface,
          borderRadius: mobileRadii.card,
          // Dark mode keeps a hairline, where the page and the card are close.
          borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
          borderColor: mobileColors.borderSubtle,
          overflow: "hidden",
        }
      : {
          backgroundColor: mobileColors.surface,
          borderRadius: mobileRadii.card,
          borderWidth: 1,
          borderColor: mobileColors.cardBorder,
          overflow: "hidden",
          ...mobileElevation("card", isDark),
        },
    requestCardHighlighted: {
      borderWidth: 1,
      borderColor: mobileColors.brand,
      backgroundColor: mobileColors.brandSoft,
    },
    cardRow: {
      gap: mobileSpace.sm,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.md,
    },
    cardSeparator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: mobileSpace.lg,
      backgroundColor: mobileColors.borderSubtle,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },
    openShiftTitleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },
    requestTitle: {
      ...mobileText.cardTitle,
      flex: 1,
      minWidth: 0,
      color: mobileColors.textPrimary,
    },
    openShiftTitle: {
      ...mobileText.sectionTitle,
      flex: 1,
      minWidth: 0,
      color: mobileColors.textPrimary,
    },
    // The time always sits under the shift name. Sharing a row made a short
    // name like "Evening Shift" break into two lines beside its time.
    shiftTitleTimeRow: {
      flex: 1,
      minWidth: 0,
      gap: mobileSpace.xs,
    },
    shiftTitleTimeText: {
      ...mobileTextWeighted("rowTitle", "medium"),
      color: mobileColors.textMuted,
      // Matches the pill's text below: Android's default font padding throws
      // off vertical centering against the padded pill next to it.
      includeFontPadding: false,
    },
    splitShiftPanel: {
      gap: mobileSpace.md,
    },
    shiftBlock: {
      gap: mobileSpace.xs,
    },
    // A swap's two shifts stack beside one swap glyph, split by a hairline,
    // so the card says "these two trade places" without a disc on a seam.
    swapGroup: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: mobileSpace.md,
    },
    swapGutter: {
      width: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    swapShifts: {
      flex: 1,
      minWidth: 0,
    },
    swapDivider: {
      height: StyleSheet.hairlineWidth,
      marginVertical: mobileSpace.md,
      backgroundColor: mobileColors.borderSubtle,
    },
    shiftPerson: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
    },
    // The shift's name with its job pills directly under it; beside it they
    // fought the name for width on a phone.
    shiftTitleRow: {
      alignItems: "flex-start",
      gap: mobileSpace.xs,
    },
    shiftTitle: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    shiftContext: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    shiftWhen: {
      ...mobileTextWeighted("meta", "medium"),
      ...mobileTabularText,
      color: mobileColors.textMuted,
    },
    // A tinted fill without an outline.
    statusChip: {
      ...mobilePillOverflow.displayContainer,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.surfaceSecondary,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.xs,
      alignSelf: "flex-start",
    },
    statusChipText: {
      ...mobileTextWeighted("meta", "semibold"),
      ...mobilePillOverflow.displayText,
      color: mobileColors.textSecondary,
      includeFontPadding: false,
    },
    metaText: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    awaitingNote: {
      ...mobileText.meta,
      color: mobileColors.warningText,
    },
    openShiftContextText: {
      ...mobileText.rowTitle,
      color: mobileColors.textSecondary,
    },
    jobPill: {
      ...mobilePillOverflow.displayContainer,
      alignSelf: "flex-start",
      borderRadius: mobileRadius.md,
      borderWidth: 1,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
    },
    jobPillCompact: {
      borderRadius: mobileRadius.md,
      paddingHorizontal: mobileSpace.sm,
      paddingVertical: mobileSpace.xs,
    },
    jobPillTextStack: {
      minWidth: 0,
      gap: mobileSpace.xs,
    },
    jobPillInlineTextRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 4,
      minWidth: 0,
    },
    // Nothing a person reads sits under 13pt, so every pill line takes `meta`.
    jobPillEyebrowText: {
      ...mobileText.meta,
      includeFontPadding: false,
    },
    jobPillText: {
      ...mobileTextWeighted("meta", "semibold"),
      ...mobilePillOverflow.displayText,
      textTransform: "uppercase",
      includeFontPadding: false,
    },
    jobPillMentoredText: {
      textTransform: "none",
    },
    // The nested variant inherits the value text's metrics; this inline one is
    // a sibling of the label, so it has to state them or it falls back to the
    // system default size and sits off the label's baseline.
    jobPillMentoredInlineText: {
      ...mobileTextWeighted("meta", "medium"),
      textTransform: "none",
      includeFontPadding: false,
    },
    jobPillValueText: {
      ...mobileTextWeighted("meta", "semibold"),
      ...mobilePillOverflow.displayText,
      includeFontPadding: false,
    },
    mentoredPill: {
      ...mobilePillOverflow.displayContainer,
      alignSelf: "flex-start",
      borderRadius: mobileRadius.md,
      backgroundColor: mobileColors.surfaceSecondary,
      minHeight: 28,
      justifyContent: "center",
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.xs,
    },
    mentoredPillText: {
      ...mobileTextWeighted("meta", "semibold"),
      ...mobilePillOverflow.displayText,
      color: mobileColors.textSecondary,
      includeFontPadding: false,
    },
  });
