import { StyleSheet } from "react-native";
import {
  mobileElevation,
  mobileRadii,
  mobileSpace,
  mobileText,
  mobileTextWeighted,
  mobileTypography,
  type MobileColors,
} from "../../../shared/theme/tokens";

/**
 * Fixed pixel geometry shared by the screen and its stylesheet.
 */
export const ACTION_SEGMENT_PANEL_RADIUS = mobileRadii.card;
export const ACTION_SEGMENT_PANEL_PADDING = 14;
export const ACTION_SEGMENT_OPTION_RADIUS = Math.min(
  ACTION_SEGMENT_PANEL_RADIUS - 4,
  Math.max(8, ACTION_SEGMENT_PANEL_RADIUS - ACTION_SEGMENT_PANEL_PADDING / 2),
);

/**
 * The stylesheet for the shift-detail screen's screen. Split out of the screen file
 * purely for size; this is a move, not a rewrite.
 */
export const createStyles = (mobileColors: MobileColors, isDark = false) =>
  StyleSheet.create({
    shiftDetailCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      // Borderless in light mode, hairline in dark: matches the shared Card.
      borderWidth: isDark ? 1 : 0,
      borderColor: mobileColors.borderSubtle,
      marginTop: 12,
      marginBottom: 8,
      padding: mobileSpace.xl,
      gap: mobileSpace.lg,
      ...mobileElevation("card", isDark),
    },
    detailHeroHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 14,
    },
    detailHeroCopy: {
      flex: 1,
      minWidth: 0,
      gap: 7,
    },
    detailHeroPillRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      flexWrap: "wrap",
      gap: 10,
    },
    detailHeroTitle: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
    },
    detailEmployeeName: {
      ...mobileText.rowTitle,
      color: mobileColors.textSubtle,
    },
    detailHeaderJobPill: {
      minHeight: 28,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 0,
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    detailHeaderJobPillText: {
      ...mobileText.badge,
      textTransform: "uppercase",
    },
    detailHeaderJobPillMentoredText: {
      ...mobileText.badge,
      textTransform: "none",
    },
    detailInfoStack: {
      gap: 14,
    },
    detailSplitNotice: {
      ...mobileText.bodyStrong,
      color: mobileColors.textSecondary,
    },
    detailActionsRow: {
      flexDirection: "row",
      gap: 10,
    },
    // Splits the row evenly between the two shared <Button fullWidth> actions.
    detailActionButtonWrap: {
      flex: 1,
    },
    detailPublishedFooter: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      paddingTop: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    detailPublishedText: {
      flex: 1,
      minWidth: 0,
      ...mobileText.meta,
      color: mobileColors.textSubtle,
    },
    // Nested inside detailPublishedText, so it inherits that token's size and
    // only needs to move the family up a weight.
    detailPublishedName: {
      fontFamily: mobileTypography.fontFamily.semibold,
      color: mobileColors.textMuted,
    },
    detailInfoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    // 32/10/bordered: matches the app's shared icon-tile pattern (Screen.tsx's
    // cardIconFrame, ProfilePrimitives' iconBadge) rather than the borderless
    // circle reserved for large standalone icons.
    detailInfoIconBox: {
      width: 32,
      height: 32,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    detailInfoCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    detailInfoLabel: {
      ...mobileText.label,
      textTransform: "uppercase",
      color: mobileColors.textSubtle,
    },
    detailInfoValue: {
      ...mobileText.rowTitle,
      color: mobileColors.textSecondary,
    },
    detailGroup: {
      gap: 10,
      alignItems: "flex-start",
    },
    detailDateTile: {
      width: 60,
      minHeight: 68,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 8,
    },
    detailDateWeekday: {
      ...mobileText.badge,
      color: mobileColors.textSubtle,
      textTransform: "uppercase",
    },
    detailDateDay: {
      ...mobileText.heroMetric,
      color: mobileColors.textPrimary,
    },
    detailShiftTitle: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    detailSummaryText: {
      ...mobileTextWeighted("body", "medium"),
      color: mobileColors.textMuted,
    },
    detailFocusAreaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    detailFocusAreaText: {
      ...mobileText.bodyStrong,
      color: mobileColors.textSecondary,
    },
    detailFootnote: {
      ...mobileText.caption,
      color: mobileColors.textSubtle,
      paddingTop: 2,
    },
    detailJobChip: {
      alignSelf: "flex-start",
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    detailJobPillRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
    },
    detailJobChipTextStack: {
      gap: 2,
    },
    detailJobChipInlineTextRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    detailJobChipEyebrowText: {
      ...mobileText.micro,
    },
    detailJobChipText: {
      ...mobileText.badge,
      textTransform: "uppercase",
    },
    detailJobChipMentoredText: {
      textTransform: "none",
    },
    detailJobChipValueText: {
      ...mobileTextWeighted("badge", "semibold"),
    },
    mentoredPill: {
      alignSelf: "flex-start",
      borderRadius: 8,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surfaceSecondary,
      minHeight: 28,
      justifyContent: "center",
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    mentoredPillText: {
      ...mobileText.badge,
      color: mobileColors.textSecondary,
    },
    detailSegmentList: {
      gap: 12,
    },
    detailSegmentBlock: {
      gap: 5,
    },
    detailSegmentDivider: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      paddingTop: 12,
    },
    detailSegmentTitle: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    detailSegmentMeta: {
      ...mobileTextWeighted("body", "medium"),
      color: mobileColors.textMuted,
    },
    sectionBlock: {
      gap: 12,
    },
    sectionBody: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    shiftmatesList: {
      gap: 0,
    },
    shiftmateSegmentGroups: {
      gap: 24,
    },
    shiftmateSegmentGroup: {
      gap: 6,
    },
    shiftmateSegmentHeader: {
      paddingBottom: 2,
    },
    shiftmateSegmentHeaderCopy: {
      gap: 2,
      minWidth: 0,
    },
    shiftmateSegmentTitleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    shiftmateSegmentTitleMeta: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    shiftmateSegmentTitle: {
      flexShrink: 1,
      minWidth: 0,
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
    },
    shiftmateSegmentTime: {
      flexShrink: 0,
      ...mobileTextWeighted("meta", "semibold"),
      color: mobileColors.textMuted,
    },
    shiftmateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 0,
      paddingVertical: 13,
    },
    shiftmateRowBorder: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
    },
    shiftmateAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    shiftmateAvatarText: {
      ...mobileText.bodyStrong,
    },
    shiftmateContent: {
      flex: 1,
      gap: 5,
      minWidth: 0,
    },
    shiftmateHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    shiftmateName: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
      flex: 1,
    },
    shiftmateChipRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      flexWrap: "wrap",
      gap: 8,
    },
    shiftmateMeta: {
      ...mobileTextWeighted("meta", "medium"),
      color: mobileColors.textMuted,
    },
    supportingSegmentList: {
      gap: 8,
    },
    supportingSegmentBlock: {
      gap: 4,
    },
    supportingSegmentDivider: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      paddingTop: 8,
    },
    supportingSegmentTitle: {
      ...mobileText.bodyStrong,
      color: mobileColors.textSecondary,
    },
    supportingSegmentMeta: {
      ...mobileTextWeighted("meta", "medium"),
      color: mobileColors.textMuted,
    },
    sectionTitle: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
    },
    modalContent: {
      gap: 18,
    },
    subsection: {
      gap: 14,
    },
    subsectionLabel: {
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
    },
    subsectionBody: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    modalInlinePanel: {
      gap: 12,
      padding: 16,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      backgroundColor: mobileColors.surface,
    },
    actionSegmentPanel: {
      gap: 10,
      padding: ACTION_SEGMENT_PANEL_PADDING,
      borderRadius: ACTION_SEGMENT_PANEL_RADIUS,
      borderWidth: 1,
      borderColor: mobileColors.brandBorder,
      backgroundColor: mobileColors.brandSoft,
    },
    actionSegmentOptions: {
      gap: 8,
    },
    swapSummaryList: {
      gap: 10,
    },
    swapSummaryCard: {
      backgroundColor: mobileColors.surfaceSecondary,
      borderRadius: mobileRadii.card,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 6,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
    },
    swapSummaryLabel: {
      ...mobileText.label,
      color: mobileColors.textSubtle,
      textTransform: "uppercase",
    },
    swapSummaryTitle: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    swapSummaryDate: {
      ...mobileTextWeighted("meta", "medium"),
      color: mobileColors.textMuted,
    },
    swapSummaryNote: {
      ...mobileTextWeighted("meta", "medium"),
      color: mobileColors.textMuted,
    },
    swapSummaryMeta: {
      ...mobileTextWeighted("meta", "medium"),
      color: mobileColors.textSecondary,
    },
    coverageOptionList: {
      gap: 10,
    },
    coverageOptionCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      padding: 16,
      gap: 8,
      position: "relative",
    },
    coverageOptionCardDanger: {
      borderColor: mobileColors.dangerBorder,
      backgroundColor: mobileColors.dangerSoft,
    },
    coverageOptionCardActive: {
      borderColor: mobileColors.brandBorder,
      backgroundColor: mobileColors.brandSoft,
    },
    coverageOptionCardActiveDanger: {
      borderColor: mobileColors.dangerText,
    },
    coverageOptionCardDisabled: {
      opacity: 0.5,
    },
    coverageOptionTitle: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    coverageOptionTitleWithCheck: {
      paddingRight: 28,
    },
    coverageOptionTitleDanger: {
      color: mobileColors.dangerText,
    },
    coverageOptionBody: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    coverageOptionCheckmark: {
      position: "absolute",
      top: 12,
      right: 12,
      width: 20,
      height: 20,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.brand,
    },
    coverageOptionCheckmarkDanger: {
      backgroundColor: mobileColors.dangerText,
    },
    coverageNotice: {
      ...mobileText.body,
      color: mobileColors.warningText,
    },
    selectorWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    selectorChip: {
      borderRadius: mobileRadii.pill,
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: mobileColors.surfaceSecondary,
    },
    selectorSegment: {
      minHeight: 56,
      borderRadius: ACTION_SEGMENT_OPTION_RADIUS,
      backgroundColor: mobileColors.surfaceSecondary,
      borderWidth: 1,
      borderColor: mobileColors.brandBorder,
      paddingHorizontal: 14,
      paddingVertical: 13,
      justifyContent: "center",
    },
    selectorChipDisabled: {
      opacity: 0.5,
    },
    selectorSegmentDisabled: {
      backgroundColor: mobileColors.surfaceMuted,
      borderColor: mobileColors.borderSubtle,
    },
    selectorChipActive: {
      backgroundColor: mobileColors.brandSoft,
      borderWidth: 1,
      borderColor: mobileColors.brandBorder,
    },
    selectorSegmentActive: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.brand,
      shadowColor: mobileColors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 10,
      elevation: 2,
    },
    selectorSegmentContent: {
      width: "100%",
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    selectorChipText: {
      ...mobileText.bodyStrong,
      color: mobileColors.textSecondary,
    },
    selectorSegmentText: {
      flex: 1,
      minWidth: 0,
    },
    selectorSegmentTextDisabled: {
      color: mobileColors.textSubtle,
    },
    selectorChipTextActive: {
      color: mobileColors.brand,
    },
    selectorSegmentCheckmark: {
      width: 22,
      height: 22,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.brand,
    },
    swapSelectedPanel: {
      gap: 12,
    },
    swapDateFilteredList: {
      gap: 12,
    },
    swapWeekNav: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    swapWeekNavButton: {
      width: 44,
      height: 44,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    swapWeekNavButtonPressed: {
      transform: [{ scale: 0.98 }],
    },
    swapWeekNavButtonDisabled: {
      opacity: 0.5,
    },
    swapWeekRangeLabel: {
      ...mobileTextWeighted("rowTitle", "bold"),
      color: mobileColors.textPrimary,
      flex: 1,
      textAlign: "center",
    },
    swapDateGrid: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 6,
    },
    swapDateChip: {
      flex: 1,
      minWidth: 0,
      minHeight: 68,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surface,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      paddingHorizontal: 4,
      paddingVertical: 8,
    },
    swapDateChipActive: {
      borderColor: mobileColors.brandBorder,
      backgroundColor: mobileColors.brandSoft,
    },
    swapDateChipDisabled: {
      opacity: 0.5,
    },
    swapDateChipWeekday: {
      ...mobileText.micro,
      color: mobileColors.textSubtle,
      textTransform: "uppercase",
    },
    swapDateChipDay: {
      // 800 was never reachable - DM Sans stops at 700.
      fontFamily: mobileTypography.fontFamily.bold,
      fontSize: 20,
      lineHeight: 24,
      color: mobileColors.textPrimary,
    },
    swapDateChipTextActive: {
      color: mobileColors.brand,
    },
    swapDateChipCount: {
      minWidth: 0,
      minHeight: 18,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      paddingHorizontal: 5,
      backgroundColor: mobileColors.surfaceSecondary,
    },
    swapDateChipCountActive: {
      backgroundColor: mobileColors.surface,
    },
    swapDateChipCountText: {
      ...mobileText.micro,
      color: mobileColors.textMuted,
    },
    swapDateChipCountTextActive: {
      color: mobileColors.brand,
    },
    swapOptions: {
      gap: 8,
    },
    swapOptionCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      padding: 14,
      gap: 8,
    },
    swapOptionCardActive: {
      backgroundColor: mobileColors.brandSoft,
      borderColor: mobileColors.brandBorder,
    },
    swapOptionCardDisabled: {
      opacity: 0.5,
    },
    swapOptionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    swapOptionName: {
      ...mobileText.bodyStrong,
      color: mobileColors.textPrimary,
      flex: 1,
    },
    swapOptionDetail: {
      ...mobileTextWeighted("meta", "semibold"),
      color: mobileColors.textSecondary,
    },
  });
