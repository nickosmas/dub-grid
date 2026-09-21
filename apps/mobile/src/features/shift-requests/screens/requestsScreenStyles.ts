import { StyleSheet } from "react-native";
import {
  mobilePillOverflow,
  mobileElevation,
  mobileRadii,
  mobileRadius,
  mobileSpace,
  mobileSpacing,
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
    // A day's tile and its cards side by side. The groups carry their own
    // spacing as bottom padding rather than a list gap so the rail's line
    // can run through it and meet the next tile.
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
    requestCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      padding: 16,
      gap: mobileSpace.md,
      ...mobileElevation("card", isDark),
    },
    openShiftCard: {
      gap: 12,
      padding: mobileSpace.lg,
    },
    requestCardHighlighted: {
      borderColor: mobileColors.brand,
      backgroundColor: mobileColors.brandSoft,
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
    cardTitleRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.md,
    },
    cardBody: {
      gap: mobileSpace.md,
    },
    cardActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-start",
      gap: 8,
      paddingTop: mobileSpace.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.borderSubtle,
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
      // off vertical centering against the bordered/padded pill next to it.
      includeFontPadding: false,
    },
    shiftPillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 8,
    },
    splitShiftPanel: {
      gap: mobileSpace.md,
    },
    splitShiftPanelLabel: {
      ...mobileTextWeighted("meta", "bold"),
      color: mobileColors.textMuted,
    },
    // A shift inside a request card: a panel on the card's secondary surface,
    // one radius step in from the card so the two read as nested, not stacked.
    shiftPanel: {
      gap: mobileSpace.xs,
      padding: mobileSpace.md,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.surfaceSecondary,
    },
    shiftPanelPerson: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
    },
    // The shift's name with its job pills directly under it; beside it they
    // fought the name for width on a phone.
    shiftTitleRow: {
      alignItems: "flex-start",
      gap: mobileSpace.xs,
    },
    shiftPanelTitle: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    shiftPanelContext: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    shiftPanelWhen: {
      ...mobileTextWeighted("meta", "medium"),
      ...mobileTabularText,
      color: mobileColors.textMuted,
    },
    // The arrow sits between the two panels, and its negative margin pulls
    // them in so the column's gap does not open twice around it.
    swapArrowRow: {
      alignItems: "center",
      marginVertical: -mobileSpace.xs,
    },
    swapArrow: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.brandSoft,
    },
    statusChip: {
      ...mobilePillOverflow.displayContainer,
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      borderColor: mobileColors.border,
      backgroundColor: mobileColors.surfaceSecondary,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
      alignSelf: "flex-start",
    },
    statusChipText: {
      ...mobileTextWeighted("caption", "semibold"),
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
    queueGroup: {
      gap: mobileSpace.md,
    },
    queueGroupTitle: {
      ...mobileTextWeighted("sectionTitle", "medium"),
      color: mobileColors.textSubtle,
    },
    openShiftContextStack: {
      gap: 8,
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
    jobPillEyebrowText: {
      ...mobileText.micro,
      includeFontPadding: false,
    },
    // The ramp floors at `micro`; a compact eyebrow keeps that size.
    jobPillEyebrowTextCompact: {
      fontSize: mobileText.micro.fontSize,
    },
    jobPillText: {
      ...mobileText.badge,
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
      ...mobileTextWeighted("badge", "medium"),
      textTransform: "none",
      includeFontPadding: false,
    },
    jobPillMentoredInlineTextCompact: {
      fontSize: mobileText.label.fontSize,
      lineHeight: mobileText.label.lineHeight,
    },
    jobPillTextCompact: {
      fontSize: mobileText.label.fontSize,
      lineHeight: mobileText.label.lineHeight,
    },
    jobPillValueText: {
      ...mobileTextWeighted("meta", "semibold"),
      ...mobilePillOverflow.displayText,
      includeFontPadding: false,
    },
    jobPillValueTextCompact: {
      fontSize: mobileText.label.fontSize,
    },
    mentoredPill: {
      ...mobilePillOverflow.displayContainer,
      alignSelf: "flex-start",
      borderRadius: mobileRadius.md,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surfaceSecondary,
      minHeight: 28,
      justifyContent: "center",
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.xs,
    },
    mentoredPillText: {
      ...mobileText.badge,
      ...mobilePillOverflow.displayText,
      color: mobileColors.textSecondary,
      includeFontPadding: false,
    },
  });
