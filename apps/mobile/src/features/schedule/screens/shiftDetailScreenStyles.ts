import { StyleSheet } from "react-native";
import {
  mobileMotion,
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
 * Foreground colours for the hero card, which paints its own gradient and so
 * cannot take them from the theme's surface-relative tokens.
 */
export const HERO_ICON_COLOR = "rgba(255, 255, 255, 0.82)";
export const HERO_DANGER_CONTENT_COLOR = "#FECACA";

/**
 * The stylesheet for the shift-detail screen's screen. Split out of the screen file
 * purely for size; this is a move, not a rewrite.
 */
export const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    // Geometry and shadow are the Home hero's (scheduleScreenStyles' meHeroCard):
    // the gradient and background colour are applied by the screen so the two
    // cards stay one surface.
    shiftDetailCard: {
      position: "relative",
      overflow: "hidden",
      borderRadius: 24,
      marginTop: 12,
      marginBottom: 8,
      paddingHorizontal: 18,
      paddingVertical: 18,
      shadowOffset: {
        width: 0,
        height: 14,
      },
      shadowOpacity: 1,
      shadowRadius: 28,
      elevation: 5,
    },
    // The placeholder stands in for the hero before its data lands, so it keeps
    // the hero's geometry but a plain surface: skeleton bars on the gradient
    // read as a broken card rather than a loading one.
    shiftDetailSkeletonCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      marginTop: 12,
      marginBottom: 8,
      paddingHorizontal: 18,
      paddingVertical: 18,
      gap: 16,
    },
    detailHeroContent: {
      gap: 11,
    },
    detailHeroHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    detailHeroCopy: {
      flex: 1,
      minWidth: 0,
      gap: 10,
    },
    detailHeroBadge: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    detailHeroBadgeDot: {
      width: 9,
      height: 9,
      borderRadius: 4.5,
    },
    detailHeroBadgeDotActive: {
      backgroundColor: "#86EFAC",
    },
    detailHeroBadgeDotScheduled: {
      backgroundColor: "#BFDBFE",
    },
    detailHeroBadgeDotMuted: {
      backgroundColor: "rgba(255, 255, 255, 0.55)",
    },
    detailHeroBadgeText: {
      ...mobileText.label,
      color: mobileColors.textInverse,
      textTransform: "uppercase",
    },
    detailHeroPillRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      flexWrap: "wrap",
      gap: 10,
    },
    detailHeroTitle: {
      ...mobileText.heroMetric,
      color: mobileColors.textInverse,
    },
    detailEmployeeName: {
      ...mobileText.rowTitle,
      color: "rgba(255, 255, 255, 0.82)",
    },
    detailHeroAreaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 2,
    },
    detailHeroAreaLabel: {
      ...mobileText.rowTitle,
      color: "rgba(255, 255, 255, 0.86)",
      flexShrink: 1,
      minWidth: 0,
    },
    detailHeroScheduleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 6,
    },
    detailHeroTimeRow: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 9,
      minWidth: 0,
    },
    detailHeroTimeText: {
      ...mobileText.sectionTitle,
      color: mobileColors.textInverse,
      flexShrink: 1,
    },
    detailHeroProgressLabel: {
      ...mobileText.rowTitle,
      color: "rgba(255, 255, 255, 0.86)",
      flexShrink: 0,
    },
    detailHeroProgressTrack: {
      height: 7,
      borderRadius: 999,
      backgroundColor: "rgba(15, 23, 42, 0.24)",
      overflow: "hidden",
      marginTop: 4,
    },
    detailHeroProgressFill: {
      height: "100%",
      borderRadius: 999,
      backgroundColor: "#42E878",
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
    detailSplitNotice: {
      ...mobileText.bodyStrong,
      color: "rgba(255, 255, 255, 0.82)",
    },
    detailActionsRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 6,
    },
    // Mirrors the shared Button at size lg: solid fill, no border, pill. The JSX
    // still hand-rolls the Pressable because these buttons flex to share a row;
    // it converts to <Button fullWidth> when this screen is next opened. The
    // fills are translucent white rather than the theme's soft tones, which
    // would fight the gradient the buttons now sit on.
    detailActionButton: {
      flex: 1,
      minHeight: 56,
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.2)",
      backgroundColor: "rgba(15, 23, 42, 0.24)",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.md,
    },
    detailActionButtonSecondary: {
      backgroundColor: "rgba(255, 255, 255, 0.18)",
    },
    detailActionButtonPressed: {
      transform: [{ scale: mobileMotion.press.scale }],
    },
    detailActionButtonDisabled: {
      opacity: 0.4,
    },
    detailActionButtonContent: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    detailActionButtonText: {
      ...mobileText.bodyStrong,
    },
    detailPublishedFooter: {
      borderTopWidth: 1,
      borderTopColor: "rgba(255, 255, 255, 0.18)",
      paddingTop: 16,
      marginTop: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    detailPublishedText: {
      flex: 1,
      minWidth: 0,
      ...mobileText.meta,
      color: "rgba(255, 255, 255, 0.7)",
    },
    // Nested inside detailPublishedText, so it inherits that token's size and
    // only needs to move the family up a weight.
    detailPublishedName: {
      fontFamily: mobileTypography.fontFamily.semibold,
      color: "rgba(255, 255, 255, 0.9)",
    },
    detailInfoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    detailGroup: {
      gap: 10,
      alignItems: "flex-start",
    },
    detailDateTile: {
      minWidth: 58,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.22)",
      backgroundColor: "rgba(255, 255, 255, 0.14)",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    detailDateWeekday: {
      ...mobileText.label,
      color: "rgba(255, 255, 255, 0.72)",
      textTransform: "uppercase",
    },
    detailDateDay: {
      ...mobileText.heroMetric,
      color: mobileColors.textInverse,
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
    mentoredPillInverse: {
      backgroundColor: "rgba(255, 255, 255, 0.16)",
      borderColor: "rgba(255, 255, 255, 0.24)",
    },
    mentoredPillText: {
      ...mobileText.badge,
      color: mobileColors.textSecondary,
    },
    mentoredPillTextInverse: {
      color: mobileColors.textInverse,
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
