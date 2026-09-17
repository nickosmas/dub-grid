import { StyleSheet } from "react-native";
import {
  mobilePillOverflow,
  mobileElevation,
  mobileRadii,
  mobileRadius,
  mobileSpace,
  mobileSpacing,
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
    dateGroup: {
      gap: mobileSpace.md,
    },
    dateGroupLabel: {
      ...mobileText.bodyStrong,
      color: mobileColors.textMuted,
    },
    dateGroupItems: {
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
      alignItems: "flex-start",
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
      alignItems: "flex-start",
      gap: mobileSpace.md,
    },
    cardIconFrame: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.brandSoft,
    },
    cardIconFrameMuted: {
      backgroundColor: mobileColors.surface,
    },
    titleColumn: {
      flex: 1,
      minWidth: 0,
      gap: mobileSpace.md,
    },
    cardActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-start",
      gap: 8,
      marginLeft: mobileSpace["4xl"],
      paddingTop: mobileSpace.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.borderSubtle,
    },
    cardActionsFlush: {
      marginLeft: 0,
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
    shiftTitleTimeRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 12,
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
    shiftPill: {
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    shiftPillText: {
      ...mobileTextWeighted("meta", "semibold"),
      includeFontPadding: false,
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
