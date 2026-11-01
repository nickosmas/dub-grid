import { StyleSheet } from "react-native";
import {
  mobileAvatarText,
  mobileRadii,
  mobileRadius,
  mobileSpace,
  mobileTabularText,
  mobileText,
  mobileTextWeighted,
  mobileTypography,
  type MobileColors,
} from "../../../shared/theme/tokens";

/**
 * The shift-detail screen's styles. The groups, rows and separators are the
 * grouped-list primitives in `components/shift-detail/DetailList`; this holds
 * what goes inside the rows.
 */
export const createStyles = (mobileColors: MobileColors, _isDark = false) =>
  StyleSheet.create({
    heroRow: {
      gap: mobileSpace.sm,
      paddingVertical: mobileSpace.lg,
    },
    heroTitleRow: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
    },
    heroTitle: {
      ...mobileText.title,
      color: mobileColors.textPrimary,
    },
    heroTitleInline: {
      flexShrink: 1,
      minWidth: 0,
    },
    heroPillRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: mobileSpace.sm,
    },
    heroEmployeeName: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    // The chip kind ("Absence", "General shift") reads as the title over its
    // pill, as the home card's type pill does.
    headerJobPillStack: {
      alignSelf: "flex-start",
      maxWidth: "100%",
      gap: mobileSpace.sm,
    },
    headerJobPillEyebrow: {
      ...mobileText.cardTitle,
      color: mobileColors.textMuted,
    },
    bodyText: {
      ...mobileText.body,
      color: mobileColors.textPrimary,
    },
    metaText: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
    },
    rowTitleText: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    secondaryText: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    secondaryTabularText: {
      ...mobileText.body,
      ...mobileTabularText,
      color: mobileColors.textSecondary,
    },
    fieldLabelText: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
    },
    requestInProgressRow: {
      gap: mobileSpace.xs,
    },
    noteGroups: {
      gap: mobileSpace.sm,
    },
    noteGroup: {
      gap: mobileSpace.xs,
    },
    noteGroupTitle: {
      ...mobileText.bodyStrong,
      color: mobileColors.textSecondary,
    },
    publishedText: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    // Nested inside publishedText, so it inherits that token's size and only
    // moves the family up a weight.
    publishedName: {
      fontFamily: mobileTypography.fontFamily.semibold,
      color: mobileColors.textPrimary,
    },
    sheetGroups: {
      gap: mobileSpace.lg,
    },
    previousSegmentRow: {
      gap: mobileSpace.xs,
    },
    jobChip: {
      alignSelf: "flex-start",
      borderRadius: mobileRadius.md,
      paddingHorizontal: mobileSpace.sm,
      paddingVertical: mobileSpace.xs,
    },
    jobPillRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: mobileSpace.sm,
    },
    jobChipTextStack: {
      gap: mobileSpace.xs,
    },
    jobChipInlineTextRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    jobChipEyebrowText: {
      ...mobileText.meta,
    },
    jobChipText: {
      ...mobileTextWeighted("meta", "semibold"),
    },
    jobChipTextProminent: {
      ...mobileText.title,
      flexShrink: 1,
    },
    jobChipMentoredText: {
      ...mobileTextWeighted("meta", "medium"),
    },
    mentoredPill: {
      alignSelf: "flex-start",
      borderRadius: mobileRadius.md,
      backgroundColor: mobileColors.surfaceSecondary,
      justifyContent: "center",
      paddingHorizontal: mobileSpace.sm,
      paddingVertical: mobileSpace.xs,
    },
    mentoredPillText: {
      ...mobileTextWeighted("meta", "semibold"),
      color: mobileColors.textSecondary,
    },
    segmentHeaderRow: {
      gap: mobileSpace.xs,
    },
    segmentHeaderTitle: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
    },
    segmentHeaderText: {
      flexShrink: 1,
      minWidth: 0,
      ...mobileText.bodyStrong,
      color: mobileColors.textPrimary,
    },
    segmentHeaderTime: {
      ...mobileText.meta,
      ...mobileTabularText,
      color: mobileColors.textMuted,
    },
    shiftmateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.md,
    },
    shiftmateAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    shiftmateAvatarText: {
      ...mobileAvatarText(40),
    },
    shiftmateContent: {
      flex: 1,
      gap: mobileSpace.xs,
      minWidth: 0,
    },
    shiftmateHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: mobileSpace.md,
    },
    shiftmateHeaderStacked: {
      flexDirection: "column",
      alignItems: "stretch",
      gap: mobileSpace.xs,
    },
    shiftmateName: {
      ...mobileText.body,
      color: mobileColors.textPrimary,
      flex: 1,
    },
    shiftmateChipRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      flexWrap: "wrap",
      gap: mobileSpace.sm,
    },
    shiftmateChipRowStacked: {
      justifyContent: "flex-start",
    },
    modalContent: {
      gap: mobileSpace.xl,
    },
    coverageNotice: {
      ...mobileText.meta,
      color: mobileColors.warningText,
      paddingHorizontal: mobileSpace.lg,
    },
    swapSummaryRow: {
      gap: mobileSpace.xs,
    },
    weekStepperRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
    },
    weekStepperLabel: {
      ...mobileTextWeighted("body", "semibold"),
      ...mobileTabularText,
      color: mobileColors.textPrimary,
      flex: 1,
      textAlign: "center",
    },
    weekChevron: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 22,
    },
    // The drawn card's geometry, read only by the retired `ShiftDetailSkeleton`
    // (the screen now loads with `ShiftDetailListSkeleton`). Remove both together.
    shiftDetailCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      padding: mobileSpace.xl,
      gap: mobileSpace.lg,
    },
    detailSummaryRow: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: mobileSpace.md,
    },
    detailSummaryContent: {
      flex: 1,
      minWidth: 0,
      gap: mobileSpace.lg,
    },
    detailHeroHeader: {
      flexDirection: "row",
    },
    detailHeroCopy: {
      flex: 1,
      minWidth: 0,
    },
    detailInfoStack: {
      gap: mobileSpace.md,
    },
    detailInfoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.md,
    },
    detailInfoCopy: {
      flex: 1,
      minWidth: 0,
      gap: mobileSpace.xs,
    },
    detailDateTile: {
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    detailActionsRow: {
      flexDirection: "row",
      gap: mobileSpace.md,
    },
    detailPublishedFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.md,
    },
    sectionBlock: {
      gap: 12,
    },
    shiftmatesList: {
      gap: 0,
    },
    shiftmateRowBorder: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
    },
  });
