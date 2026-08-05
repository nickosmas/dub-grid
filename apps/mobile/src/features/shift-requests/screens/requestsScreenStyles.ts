import { StyleSheet } from "react-native";
import {
  mobileRadii,
  mobileSpacing,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";

/**
 * The requests screen's stylesheet, split out of `RequestsScreen.tsx` for size.
 */
export const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    loadingState: {
      gap: 14,
    },
    loadingTitle: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
    },
    loadingBody: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    tabRow: {
      marginHorizontal: -mobileSpacing.screenX,
    },
    tabRowContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: mobileSpacing.screenX,
      paddingVertical: 2,
    },
    tabButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 36,
      maxWidth: 180,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surface,
    },
    tabButtonActive: {
      borderColor: mobileColors.brand,
      backgroundColor: mobileColors.brand,
    },
    tabButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: mobileColors.textSecondary,
    },
    tabButtonTextActive: {
      color: mobileColors.textInverse,
    },
    tabBadge: {
      minWidth: 20,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.surfaceSecondary,
    },
    tabBadgeActive: {
      backgroundColor: "rgba(255, 255, 255, 0.22)",
    },
    tabBadgeText: {
      ...mobileText.badge,
      color: mobileColors.textMuted,
      textAlign: "center",
      includeFontPadding: false,
    },
    tabBadgeTextActive: {
      color: mobileColors.textInverse,
    },
    section: {
      gap: 10,
    },
    dateGroup: {
      gap: 10,
    },
    dateGroupLabel: {
      ...mobileText.bodyStrong,
      color: mobileColors.textMuted,
    },
    dateGroupItems: {
      gap: 10,
    },
    requestCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      padding: 16,
      gap: 10,
    },
    openShiftCard: {
      gap: 12,
      padding: 18,
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
      gap: 10,
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
      gap: 10,
    },
    cardActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-start",
      gap: 8,
      marginLeft: 42,
      paddingTop: 10,
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
      ...mobileText.rowTitle,
      color: mobileColors.textMuted,
      fontWeight: "500",
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
      gap: 10,
    },
    splitShiftPanelLabel: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
      fontWeight: "700",
    },
    shiftPill: {
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    shiftPillText: {
      ...mobileText.meta,
      fontWeight: "600",
      includeFontPadding: false,
    },
    statusChip: {
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      borderColor: mobileColors.border,
      backgroundColor: mobileColors.surfaceSecondary,
      paddingHorizontal: 10,
      paddingVertical: 6,
      alignSelf: "flex-start",
    },
    statusChipText: {
      ...mobileText.caption,
      color: mobileColors.textSecondary,
      fontWeight: "600",
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
      alignSelf: "flex-start",
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    jobPillCompact: {
      borderRadius: 8,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    jobPillTextStack: {
      gap: 2,
    },
    jobPillInlineTextRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    jobPillEyebrowText: {
      ...mobileText.micro,
      includeFontPadding: false,
    },
    jobPillEyebrowTextCompact: {
      fontSize: 9,
    },
    jobPillText: {
      ...mobileText.badge,
      textTransform: "uppercase",
      includeFontPadding: false,
    },
    jobPillMentoredText: {
      textTransform: "none",
    },
    jobPillTextCompact: {
      fontSize: 12,
    },
    jobPillValueText: {
      ...mobileText.meta,
      fontWeight: "600",
      includeFontPadding: false,
    },
    jobPillValueTextCompact: {
      fontSize: 12,
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
      includeFontPadding: false,
    },
  });
