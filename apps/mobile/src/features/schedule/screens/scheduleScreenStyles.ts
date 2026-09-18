import { StyleSheet } from "react-native";
import { createIconControlStyle } from "../../../shared/components/icon-control-style";
import {
  mobilePillOverflow,
  mobileAvatarText,
  mobileElevation,
  mobileMotion,
  mobileRadii,
  mobileRadius,
  mobileSpacing,
  mobileTabularText,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
  mobileSpace,
} from "../../../shared/theme/tokens";

/**
 * Fixed pixel geometry shared by the screen and its stylesheet.
 */
export const MAX_VISIBLE_OPEN_SHIFT_STACK_CARDS = 4;
export const OPEN_SHIFT_CARD_MIN_HEIGHT = 180;
export const OPEN_SHIFT_CARD_SHADOW_ALLOWANCE = 18;
export const ME_HERO_AVATAR_FRAME_OVERLAP = -10;
/**
 * Height of every control in the header row — the week chevrons, Today and the
 * alerts bell. One constant because they sit side by side and read as one set:
 * Today had drifted to 36 against the icon buttons' 44, which showed up as a
 * short pill between two taller circles.
 */
export const HEADER_CONTROL_HEIGHT = 44;
// Fallback single-row height, used until the real row is measured. Matches
// monthCalendarDaySlot's minHeight in styles below.
export const WEEK_STRIP_ROW_HEIGHT = 44;
// Fixed size for the circular date highlight, shared by every week/month row.
export const DATE_HIGHLIGHT_SIZE = 36;
// Matches monthCalendarWeek/monthCalendarWeeks gap in styles below.
export const MONTH_GRID_ROW_GAP = 6;
export const MONTH_EXPAND_SECTION_GAP = 14;

/**
 * The stylesheet for the schedule screen's screen. Split out of the screen file
 * purely for size; this is a move, not a rewrite.
 */
const TIMELINE_RAIL_WIDTH = 2;
const TIMELINE_DOT_SIZE = 12;

export const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    stickyControlsSection: {
      gap: 16,
    },
    mePage: {
      gap: mobileSpace["2xl"],
      paddingTop: 8,
    },
    mePageEmpty: {
      justifyContent: "center",
      paddingTop: 0,
    },
    meTopStack: {
      gap: mobileSpace.lg,
    },
    meWelcomeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
    },
    meWelcomeCopy: {
      flex: 1,
      gap: 4,
    },
    meWelcomeDate: {
      ...mobileText.bodyStrong,
      ...mobileTabularText,
      color: mobileColors.textSubtle,
    },
    meWelcomeTitle: {
      ...mobileTextWeighted("title", "bold"),
      color: mobileColors.textPrimary,
    },
    meWeekNavigator: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: mobileSpace.md,
    },
    meWeekNavigatorCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    meWeekNavigatorTitle: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
    },
    meWeekNavigatorRangeLabel: {
      ...mobileText.bodyStrong,
      ...mobileTabularText,
      color: mobileColors.textSecondary,
    },
    meWeekNavigatorActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.md,
      flexShrink: 0,
    },
    meWeekRangeControlGroup: {
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 0,
      gap: 8,
    },
    // Matches the shared Button's `secondary` tone at size sm: solid tint, no
    // border, pill. The JSX still hand-rolls the Pressable; it converts to
    // <Button> when this screen's animation rework opens the file.
    meTodayButton: {
      height: HEADER_CONTROL_HEIGHT,
      borderRadius: mobileRadii.pill,
      // Same outlined chrome as `iconControlButton`, which it sits beside — the
      // two are one row of header controls and have to read as one set.
      borderWidth: 1,
      borderColor: mobileColors.border,
      backgroundColor: mobileColors.surface,
      justifyContent: "center",
      paddingHorizontal: mobileSpace.md,
      ...mobileElevation("raised", isDark),
    },
    meTodayButtonPressed: {
      transform: [{ scale: mobileMotion.press.scale }],
    },
    meTodayButtonText: {
      ...mobileText.bodyStrong,
      // Stays `controlSecondaryFg` even though the fill is now white, because
      // it is the one blue that clears AA in *both* themes here: 6.70:1 on
      // white and 8.52:1 on the dark bar. Plain `brand` passes in light (5.17:1)
      // and lands at 4.499:1 in dark, which is under the line.
      color: mobileColors.controlSecondaryFg,
    },
    meHeroCard: {
      position: "relative",
      overflow: "hidden",
      borderRadius: mobileRadii.card,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.lg,
      shadowOffset: {
        width: 0,
        height: 14,
      },
      shadowOpacity: 1,
      shadowRadius: 28,
      elevation: 5,
    },
    meHeroCardMuted: {
      backgroundColor: "#E2E8F0",
      shadowColor: mobileColors.shadow,
    },
    meHeroCardPressed: {
      opacity: 0.94,
    },
    meHeroGlow: {
      position: "absolute",
      borderRadius: 999,
      backgroundColor: "rgba(255, 255, 255, 0.12)",
    },
    meHeroGlowLarge: {
      width: 180,
      height: 180,
      top: -72,
      right: -58,
    },
    meHeroGlowSmall: {
      width: 140,
      height: 140,
      bottom: -64,
      left: -24,
      backgroundColor: "rgba(15, 23, 42, 0.08)",
    },
    meHeroGlowMuted: {
      backgroundColor: "rgba(255, 255, 255, 0.22)",
    },
    meHeroContent: {
      gap: 16,
    },
    meHeroHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    meHeroHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: mobileSpace.sm,
    },
    meHeroBadge: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    meHeroBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
    },
    meHeroBadgeMuted: {
      backgroundColor: "rgba(255, 255, 255, 0.55)",
    },
    meHeroBadgeDot: {
      width: 9,
      height: 9,
      borderRadius: 4.5,
    },
    meHeroBadgeDotActive: {
      backgroundColor: "#86EFAC",
    },
    meHeroBadgeDotScheduled: {
      backgroundColor: "#BFDBFE",
    },
    meHeroBadgeDotMuted: {
      backgroundColor: mobileColors.textMuted,
    },
    meHeroBadgeText: {
      ...mobileText.label,
      color: mobileColors.textInverse,
      textTransform: "uppercase",
    },
    meHeroBadgeTextMuted: {
      color: mobileColors.textPrimary,
    },
    meHeroDateTile: {
      minWidth: 58,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.22)",
      backgroundColor: "rgba(255, 255, 255, 0.14)",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: 8,
    },
    meHeroDateWeekday: {
      ...mobileText.label,
      color: "rgba(255, 255, 255, 0.72)",
    },
    meHeroDateDay: {
      ...mobileText.heroMetric,
      ...mobileTabularText,
      color: mobileColors.textInverse,
    },
    meHeroDateText: {
      ...mobileTextWeighted("meta", "semibold"),
      alignSelf: "flex-start",
      color: "rgba(255, 255, 255, 0.86)",
    },
    meHeroTitle: {
      flexShrink: 1,
      minWidth: 0,
      ...mobileText.heroMetric,
      color: mobileColors.textInverse,
    },
    meHeroTitleBadgeSlot: {
      // Hangs a split-shift or change pill from the hero title's baseline.
      // `flex-end` alone lands on the line box, a descender below the text.
      alignSelf: "flex-end",
      marginBottom: mobileSpace.sm,
    },
    meHeroTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: mobileSpace.sm,
    },
    meHeroHeading: {
      ...mobileText.rowTitle,
      color: mobileColors.textInverse,
    },
    meHeroHeadingMuted: {
      color: mobileColors.textSecondary,
    },
    meHeroTitleMuted: {
      color: mobileColors.textPrimary,
    },
    meHeroSupportingText: {
      ...mobileTextWeighted("body", "medium"),
      color: "rgba(255, 255, 255, 0.84)",
    },
    meHeroSupportingTextMuted: {
      color: mobileColors.textMuted,
    },
    meHeroAreaLabel: {
      ...mobileText.rowTitle,
      color: "rgba(255, 255, 255, 0.86)",
    },
    meHeroAreaLabelMuted: {
      color: mobileColors.textSecondary,
    },
    meHeroMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
    },
    meHeroAreaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    meHeroContextGroup: {
      gap: 8,
    },
    shiftChangeBadge: {
      alignSelf: "flex-start",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    shiftChangeBadgeNew: {
      backgroundColor: mobileColors.successSoft,
      borderColor: mobileColors.successBorder,
    },
    shiftChangeBadgeModified: {
      backgroundColor: mobileColors.brandSoft,
      borderColor: mobileColors.brandBorder,
    },
    shiftChangeBadgeDeleted: {
      backgroundColor: mobileColors.dangerSoft,
      borderColor: mobileColors.dangerBorder,
    },
    shiftChangeBadgeCompactSegment: {
      paddingVertical: 4,
    },
    // The hero's lone change chip stands in for the `Shift N · Edited` pill a
    // split shift shows in the same slot, so it copies `SplitShiftBadge`.
    shiftChangeBadgeInverse: {
      alignSelf: "flex-start",
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.16)",
      borderColor: "rgba(255, 255, 255, 0.28)",
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
    },
    shiftChangeBadgeText: {
      ...mobileTextWeighted("micro", "bold"),
      color: mobileColors.textSecondary,
      textTransform: "uppercase",
      // Android's font padding pushes uppercase glyphs high inside a pill this
      // tight, leaving the label visibly off-center in its own chip.
      includeFontPadding: false,
      textAlignVertical: "center",
    },
    shiftChangeBadgeTextInverse: {
      ...mobileText.badge,
      color: mobileColors.textInverse,
      textTransform: "none",
    },
    shiftChangeBadgeTextCompactSegment: {
      ...mobileText.badge,
      color: mobileColors.brand,
      textTransform: "none",
    },
    previousShiftRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
      minWidth: 0,
    },
    previousShiftText: {
      flex: 1,
      minWidth: 0,
      ...mobileText.caption,
      color: mobileColors.textSubtle,
    },
    previousShiftTextInverse: {
      color: "rgba(255, 255, 255, 0.82)",
    },
    meHeroRoleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: mobileSpace.md,
    },
    meTypePillStack: {
      alignSelf: "flex-start",
      gap: 4,
    },
    meTypePillLabel: {
      ...mobileText.rowTitle,
      color: mobileColors.textMuted,
    },
    // Size steps only: the family stays the base label's.
    meTypePillLabelRow: {
      fontSize: mobileText.cardTitle.fontSize,
      lineHeight: mobileText.cardTitle.lineHeight,
    },
    meTypePillLabelHero: {
      fontSize: mobileText.heroMetric.fontSize,
      lineHeight: mobileText.heroMetric.lineHeight,
    },
    meTypePillLabelInverse: {
      color: "rgba(255, 255, 255, 0.82)",
    },
    meHeroScheduleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: mobileSpace.md,
    },
    meHeroTimeRow: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: mobileSpace.sm,
      minWidth: 0,
    },
    meHeroTimeText: {
      ...mobileText.sectionTitle,
      ...mobileTabularText,
      color: mobileColors.textInverse,
      flexShrink: 1,
    },
    meHeroTimePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.md,
      alignSelf: "flex-start",
      backgroundColor: "rgba(29, 78, 216, 0.22)",
      borderRadius: mobileRadii.control,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.md,
    },
    meHeroTimePillMuted: {
      backgroundColor: "rgba(255, 255, 255, 0.58)",
    },
    meHeroTimePillText: {
      ...mobileText.bodyStrong,
      ...mobileTabularText,
      color: mobileColors.textInverse,
    },
    meHeroTimePillTextMuted: {
      color: mobileColors.textSecondary,
    },
    meHeroActionIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255, 255, 255, 0.18)",
    },
    meHeroActionIconMuted: {
      backgroundColor: "rgba(255, 255, 255, 0.55)",
    },
    meHeroEmptyText: {
      ...mobileTextWeighted("body", "medium"),
      color: "rgba(255, 255, 255, 0.84)",
    },
    meHeroEmptyBlock: {
      gap: mobileSpace.md,
    },
    meHeroEmptyTextMuted: {
      color: mobileColors.textSecondary,
    },
    meHeroDetails: {
      gap: 8,
    },
    meHeroDetailText: {
      ...mobileText.bodyStrong,
      color: "rgba(255, 255, 255, 0.88)",
    },
    meHeroDetailTextMuted: {
      color: mobileColors.textSecondary,
    },
    meHeroProgressBlock: {
      gap: mobileSpace.md,
      marginTop: 4,
    },
    meHeroProgressRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    meHeroProgressLabel: {
      ...mobileText.rowTitle,
      color: "rgba(255, 255, 255, 0.86)",
      flexShrink: 0,
    },
    meHeroProgressTrack: {
      height: 7,
      borderRadius: 999,
      backgroundColor: "rgba(15, 23, 42, 0.24)",
      overflow: "hidden",
    },
    meHeroProgressFill: {
      height: "100%",
      borderRadius: 999,
      backgroundColor: "#42E878",
    },
    meHeroCollaborators: {
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.14)",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: mobileSpace.md,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
      marginTop: mobileSpace.sm,
      marginBottom: mobileSpace.sm,
    },
    meHeroCollaboratorLabelRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
    },
    meHeroCollaboratorLabel: {
      ...mobileText.rowTitle,
      color: "rgba(255, 255, 255, 0.84)",
      flexShrink: 1,
    },
    meHeroAvatarStack: {
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 0,
    },
    meHeroCollaboratorAvatarFrame: {
      width: 42,
      height: 42,
      borderRadius: 21,
      padding: mobileSpace.xs,
    },
    meHeroCollaboratorAvatarFrameOverlap: {
      marginLeft: ME_HERO_AVATAR_FRAME_OVERLAP,
    },
    meHeroCollaboratorAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    meHeroCollaboratorAvatarText: {
      ...mobileAvatarText(38),
    },
    meHeroCollaboratorOverflow: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    meHeroCollaboratorOverflowText: {
      ...mobileText.bodyStrong,
      color: mobileColors.textMuted,
    },
    meSectionBlock: {
      gap: 12,
    },
    upcomingSectionBlock: {
      gap: mobileSpace.lg,
    },
    upcomingSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: mobileSpace.md,
    },
    upcomingSectionTitle: {
      ...mobileTextWeighted("title", "bold"),
      flex: 1,
      color: mobileColors.textPrimary,
    },
    upcomingHoursBadge: {
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.brandSoft,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
    },
    upcomingHoursBadgeText: {
      ...mobileText.bodyStrong,
      ...mobileTabularText,
      color: mobileColors.brand,
    },
    upcomingShiftsCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      paddingHorizontal: 20,
      ...mobileElevation("card", isDark),
    },
    upcomingDateGroup: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: mobileSpace.lg,
      marginHorizontal: -20,
      paddingHorizontal: 20,
    },
    upcomingDateColumn: {
      // minWidth, not width: at a raised OS text size the weekday and day
      // labels grow, and a hard width clips them instead of letting the column
      // take the room.
      minWidth: 60,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: mobileSpace.lg,
    },
    upcomingDateShiftStack: {
      flex: 1,
      minWidth: 0,
    },
    upcomingShiftRow: {
      minHeight: 132,
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.lg,
      paddingVertical: mobileSpace.lg,
    },
    upcomingUnscheduledRow: {
      minHeight: 132,
      justifyContent: "center",
      gap: 4,
      paddingVertical: mobileSpace.lg,
    },
    upcomingDeletedHistoryRow: {
      paddingVertical: mobileSpace.md,
    },
    upcomingUnscheduledTitle: {
      ...mobileTextWeighted("cardTitle", "bold"),
      color: mobileColors.textSecondary,
    },
    upcomingUnscheduledBody: {
      ...mobileText.caption,
      color: mobileColors.textSubtle,
    },
    upcomingShiftRowBorder: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
    },
    upcomingShiftDashedDivider: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    upcomingShiftDashedDividerSegment: {
      flex: 1,
      height: 1,
      borderRadius: 999,
      backgroundColor: mobileColors.border,
    },
    upcomingShiftRowToday: {
      backgroundColor: mobileColors.brandSoft,
    },
    upcomingShiftRowTodayFirst: {
      borderTopLeftRadius: mobileRadii.card,
      borderTopRightRadius: mobileRadii.card,
    },
    upcomingShiftRowTodayLast: {
      borderBottomLeftRadius: mobileRadii.card,
      borderBottomRightRadius: mobileRadii.card,
    },
    upcomingDateTile: {
      minWidth: 60,
      minHeight: 68,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
      gap: mobileSpace.sm,
    },
    upcomingDateWeekday: {
      ...mobileTextWeighted("badge", "semibold"),
      color: mobileColors.textSubtle,
    },
    upcomingDateDay: {
      ...mobileTextWeighted("title", "bold"),
      ...mobileTabularText,
      color: mobileColors.textSecondary,
    },
    upcomingDateTodayDot: {
      width: 5,
      height: 5,
      borderRadius: 999,
      backgroundColor: mobileColors.danger,
      marginTop: 1,
    },
    upcomingShiftCopy: {
      flex: 1,
      minWidth: 0,
      gap: mobileSpace.sm,
    },
    // Title over time, not beside it. Tighter than `upcomingShiftCopy`'s gap so
    // the two read as one heading block, with the focus area and type pill
    // spaced further below.
    upcomingShiftHeading: {
      gap: 4,
    },
    upcomingShiftTitleMeta: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    upcomingShiftTitle: {
      flexShrink: 1,
      minWidth: 0,
      ...mobileTextWeighted("cardTitle", "bold"),
      color: mobileColors.textPrimary,
    },
    upcomingShiftArea: {
      ...mobileText.rowTitle,
      color: mobileColors.textSecondary,
    },
    upcomingShiftTime: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    // Smaller and lighter than upcomingShiftTitle (17px) — the time is
    // secondary to the shift name, not competing with it for attention.
    upcomingShiftTimeText: {
      ...mobileText.meta,
      ...mobileTabularText,
      color: mobileColors.textSubtle,
    },
    meSectionHeader: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 12,
    },
    meSectionHeaderCopy: {
      flex: 1,
      gap: 4,
    },
    meSectionTitle: {
      ...mobileTextWeighted("title", "bold"),
      color: mobileColors.textPrimary,
    },
    meSectionLink: {
      ...mobileText.bodyStrong,
      color: mobileColors.brand,
    },
    meSurfaceCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      padding: mobileSpace.lg,
      shadowColor: mobileColors.shadow,
      shadowOffset: {
        width: 0,
        height: 8,
      },
      shadowOpacity: 1,
      shadowRadius: 18,
      elevation: 2,
    },
    meSectionBody: {
      ...mobileTextWeighted("body", "medium"),
      color: mobileColors.textMuted,
    },
    scheduleListRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      paddingVertical: 16,
    },
    scheduleListRowBorder: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
    },
    scheduleListCopy: {
      flex: 1,
      gap: 8,
    },
    scheduleRowDate: {
      ...mobileText.bodyStrong,
      ...mobileTabularText,
      color: mobileColors.textMuted,
    },
    scheduleRowTitle: {
      ...mobileTextWeighted("cardTitle", "bold"),
      color: mobileColors.textPrimary,
    },
    scheduleRowTitleWithBadge: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
    },
    scheduleRowMeta: {
      ...mobileText.rowTitle,
      color: mobileColors.textSecondary,
    },
    scheduleRowContext: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
    },
    scheduleRowContextStack: {
      gap: 8,
    },
    scheduleRowTime: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    scheduleRowTimeText: {
      ...mobileTextWeighted("rowTitle", "medium"),
      ...mobileTabularText,
      color: mobileColors.textMuted,
    },
    scheduleRowArrow: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surfaceSecondary,
    },
    openShiftCarousel: {
      marginHorizontal: -OPEN_SHIFT_CARD_SHADOW_ALLOWANCE,
    },
    openShiftCarouselContent: {
      gap: mobileSpace.md,
      paddingHorizontal: OPEN_SHIFT_CARD_SHADOW_ALLOWANCE,
      paddingTop: 4,
      paddingBottom: OPEN_SHIFT_CARD_SHADOW_ALLOWANCE,
      paddingRight: OPEN_SHIFT_CARD_SHADOW_ALLOWANCE + 4,
    },
    openShiftDateCard: {
      width: 320,
      gap: 12,
    },
    openShiftDateHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    openShiftDateCardItems: {
      gap: mobileSpace.md,
      paddingBottom: OPEN_SHIFT_CARD_SHADOW_ALLOWANCE,
    },
    openShiftDateCardItemsStacked: {
      gap: 0,
      minHeight: OPEN_SHIFT_CARD_MIN_HEIGHT,
      position: "relative",
    },
    openShiftCard: {
      minHeight: OPEN_SHIFT_CARD_MIN_HEIGHT,
      gap: 12,
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      padding: mobileSpace.lg,
      ...mobileElevation("card", isDark),
    },
    openShiftCardSurface: {
      gap: 12,
    },
    openShiftSplitPanel: {
      gap: mobileSpace.md,
    },
    openShiftCardLead: {
      zIndex: MAX_VISIBLE_OPEN_SHIFT_STACK_CARDS + 1,
    },
    openShiftCardStacked: {
      position: "absolute",
      shadowRadius: 14,
    },
    requestList: {
      gap: mobileSpace.md,
    },
    requestCard: {
      gap: mobileSpace.md,
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      padding: mobileSpace.lg,
      ...mobileElevation("card", isDark),
    },
    requestHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    requestHeaderCopy: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    requestAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    requestAvatarText: {
      ...mobileAvatarText(42),
    },
    requestHeaderText: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    requestHeaderTextStack: {
      flex: 1,
      gap: mobileSpace.xs,
    },
    requestHeaderSubtext: {
      ...mobileTextWeighted("meta", "semibold"),
      color: mobileColors.textSecondary,
    },
    requestDateText: {
      ...mobileText.bodyStrong,
      ...mobileTabularText,
      color: mobileColors.textMuted,
    },
    requestActions: {
      flexDirection: "row",
      gap: 12,
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
    },
    // The ramp floors at `micro`; a compact eyebrow keeps that size.
    jobPillEyebrowTextCompact: {
      fontSize: mobileText.micro.fontSize,
    },
    jobPillText: {
      ...mobileText.badge,
      ...mobilePillOverflow.displayText,
      textTransform: "uppercase",
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
    },
    meCollaboratorList: {
      gap: 0,
    },
    meCollaboratorRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      paddingVertical: 12,
    },
    meCollaboratorRowBorder: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
    },
    meCollaboratorCopy: {
      flex: 1,
      gap: 8,
    },
    meCollaboratorName: {
      ...mobileText.bodyStrong,
      color: mobileColors.textPrimary,
    },
    timelineList: {
      gap: mobileSpace.lg,
    },
    timelineSection: {
      gap: 12,
      paddingLeft: mobileSpace.lg,
      marginLeft: 4,
      borderLeftWidth: TIMELINE_RAIL_WIDTH,
      borderLeftColor: mobileColors.borderSubtle,
    },
    timelineSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.md,
      // Pulls the dot back over the section's rail: the section's own inset
      // and border, half the dot, and one point so the dot centres on a 2pt
      // line rather than sitting beside it.
      marginLeft: -(mobileSpace.lg + TIMELINE_RAIL_WIDTH + TIMELINE_DOT_SIZE / 2 + 1),
    },
    timelineDot: {
      width: TIMELINE_DOT_SIZE,
      height: TIMELINE_DOT_SIZE,
      borderRadius: 6,
      borderWidth: 3,
      borderColor: mobileColors.background,
      backgroundColor: mobileColors.brand,
    },
    timelineSectionTitle: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    timelineSectionEntries: {
      gap: mobileSpace.md,
    },
    timelineEntryCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      padding: 16,
      shadowColor: mobileColors.shadow,
      shadowOffset: {
        width: 0,
        height: 6,
      },
      shadowOpacity: 1,
      shadowRadius: 14,
      elevation: 2,
    },
    timelineEntryCardPressed: {
      opacity: 0.92,
    },
    meHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    meHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.md,
    },
    teamHeaderUtilityRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.md,
      justifyContent: "space-between",
    },
    teamHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.md,
      marginLeft: "auto",
      flexShrink: 0,
      overflow: "visible",
    },
    teamHeaderTitleArea: {
      flex: 1,
      minWidth: 0,
    },
    meSelectedDateTitle: {
      ...mobileText.screenTitle,
      ...mobileTabularText,
      flex: 1,
      color: mobileColors.textPrimary,
      textAlign: "left",
    },
    // `screenTitle`, not `display`: this title shares its row with the Today
    // button and the alerts bell, and at 28pt "Tomorrow, Sep 18" truncated to
    // "Tomorrow, Se…" the moment the Today button appeared.
    teamHeaderTitle: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
      textAlign: "left",
      flexShrink: 1,
      minWidth: 0,
    },
    // The week chevrons and the alerts bell. Shared with the sheet close
    // button, which is the same chrome on a different surface.
    iconControlButton: createIconControlStyle(mobileColors, isDark),
    iconControlButtonPressed: {
      transform: [{ scale: mobileMotion.press.iconOnlyScale }],
    },
    calendarBlock: {
      gap: MONTH_EXPAND_SECTION_GAP,
    },
    weekStripFrame: {
      overflow: "hidden",
    },
    calendarDragHandleRow: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: mobileSpace.xs,
    },
    calendarDragHandleBar: {
      width: 36,
      height: 5,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.textSubtle,
    },
    weekSwipeRowClip: {
      overflow: "hidden",
    },
    weekStripTrack: {
      flexDirection: "row",
    },
    monthCalendarWeekdays: {
      flexDirection: "row",
      gap: mobileSpace.sm,
    },
    monthCalendarWeekdayLabel: {
      ...mobileTextWeighted("label", "bold"),
      flex: 1,
      color: mobileColors.textSubtle,
      textAlign: "center",
    },
    monthCalendarWeeks: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
    },
    monthSwipeTrack: {
      flexDirection: "row",
    },
    monthGridColumn: {
      gap: MONTH_GRID_ROW_GAP,
    },
    monthCalendarWeek: {
      flexDirection: "row",
      gap: mobileSpace.sm,
    },
    monthCalendarDaySlot: {
      flex: 1,
      minHeight: WEEK_STRIP_ROW_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
    },
    dateHighlightCircle: {
      width: DATE_HIGHLIGHT_SIZE,
      height: DATE_HIGHLIGHT_SIZE,
      borderRadius: DATE_HIGHLIGHT_SIZE / 2,
      borderWidth: 1,
      borderColor: "transparent",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    dateHighlightSelected: {
      backgroundColor: mobileColors.brand,
      borderColor: mobileColors.brand,
    },
    dateHighlightTodaySelected: {
      backgroundColor: mobileColors.danger,
      borderColor: mobileColors.danger,
    },
    dateHighlightToday: {
      backgroundColor: mobileColors.dangerSoft,
      borderColor: mobileColors.dangerBorder,
    },
    dateHighlightOutsideMonth: {
      opacity: 0.4,
    },
    dateHighlightText: {
      ...mobileTextWeighted("rowTitle", "bold"),
      ...mobileTabularText,
      color: mobileColors.textPrimary,
    },
    dateHighlightTextSelected: {
      color: mobileColors.textInverse,
    },
    dateHighlightTextToday: {
      color: mobileColors.danger,
    },
    dateHighlightTextTodaySelected: {
      color: mobileColors.textInverse,
    },
    alertBadge: {
      position: "absolute",
      // Centers the badge on the button's own ring at the top-right 45°
      // point (button radius 22, badge half-size 8: 22 - 22*sin(45°) - 8 ≈
      // -2 on both axes) rather than tucking it inside the circle.
      top: -2,
      right: -2,
    },
    groupsList: {
      gap: mobileSpacing.sectionGap,
    },
    shiftGroupsList: {
      gap: mobileSpace["3xl"],
      paddingTop: 24,
    },
    shiftGroupBlock: {
      gap: 12,
    },
    shiftGroupDivider: {
      height: 1,
      backgroundColor: mobileColors.borderSubtle,
    },
    shiftGroupHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 8,
    },
    shiftGroupTitle: {
      flex: 1,
      minWidth: 0,
      ...mobileTextWeighted("title", "bold"),
      color: mobileColors.textPrimary,
    },
    shiftGroupTime: {
      flexShrink: 0,
      ...mobileText.bodyStrong,
      ...mobileTabularText,
      color: mobileColors.textSubtle,
      textAlign: "right",
    },
    weekDaySection: {
      gap: 12,
    },
    weekDayHeader: {
      gap: 4,
    },
    weekDayTitle: {
      ...mobileTextWeighted("cardTitle", "bold"),
      ...mobileTabularText,
      color: mobileColors.textPrimary,
    },
    weekDayEmptyState: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      paddingHorizontal: 16,
      paddingVertical: mobileSpace.md,
    },
    weekDayEmptyText: {
      ...mobileTextWeighted("body", "semibold"),
      color: mobileColors.textMuted,
    },
    groupEntries: {
      gap: mobileSpace.md,
    },
    teamGroupCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      paddingHorizontal: 20,
      paddingVertical: mobileSpace.md,
      ...mobileElevation("card", isDark),
    },
    teamGroupMembers: {
      marginTop: 0,
    },
    teamMemberRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      minHeight: 72,
      paddingVertical: 16,
    },
    teamMemberRowBorder: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
    },
    teamMemberAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: mobileColors.brandSoft,
      borderWidth: 1,
      borderColor: mobileColors.brandBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    teamMemberAvatarText: {
      ...mobileAvatarText(48),
      color: mobileColors.brand,
    },
    teamMemberMain: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    teamMemberCopy: {
      flex: 1,
      minWidth: 0,
      gap: mobileSpace.xs,
    },
    teamMemberNameRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    teamMemberName: {
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
    },
    teamMemberTime: {
      ...mobileText.bodyStrong,
      ...mobileTabularText,
      color: mobileColors.textSubtle,
    },
    teamMemberSplitBadgeRow: {
      alignItems: "flex-start",
    },
    teamMemberRoleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      flexWrap: "wrap",
      gap: 8,
    },
    teamMemberRoleChip: {
      borderWidth: 1,
      borderRadius: mobileRadius.md,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
    },
    teamMemberRoleChipTextStack: {
      gap: mobileSpace.xs,
    },
    teamMemberRoleChipEyebrowText: {
      ...mobileText.micro,
    },
    teamMemberRoleChipText: {
      ...mobileText.badge,
      textTransform: "uppercase",
    },
    teamMemberRoleChipValueText: {
      ...mobileTextWeighted("caption", "semibold"),
    },
    compactSegmentList: {
      gap: 8,
    },
    compactSegmentBlock: {
      gap: mobileSpace.xs,
    },
    compactSegmentDivider: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      paddingTop: 8,
    },
    compactSegmentTitle: {
      ...mobileTextWeighted("meta", "bold"),
      color: mobileColors.textSecondary,
    },
    compactSegmentMeta: {
      ...mobileTextWeighted("meta", "semibold"),
      color: mobileColors.textMuted,
    },
    heroSegmentList: {
      gap: 12,
    },
    heroSegmentBlock: {
      gap: mobileSpace.sm,
    },
    heroSegmentDivider: {
      borderTopWidth: 1,
      borderTopColor: "rgba(255, 255, 255, 0.18)",
      paddingTop: 12,
    },
    heroSegmentTitle: {
      ...mobileText.sectionTitle,
      color: mobileColors.textInverse,
    },
    heroSegmentMeta: {
      ...mobileTextWeighted("body", "medium"),
      color: "rgba(255, 255, 255, 0.84)",
    },
    timelineSegmentList: {
      gap: 12,
    },
    timelineSegmentBlock: {
      gap: 4,
    },
    timelineSegmentDivider: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      paddingTop: 12,
    },
    timelineSegmentTitle: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    timelineSegmentMeta: {
      ...mobileTextWeighted("meta", "medium"),
      color: mobileColors.textMuted,
    },
    entryCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      padding: 16,
      gap: 12,
    },
    entrySegmentList: {
      gap: 12,
    },
    entrySegmentBlock: {
      gap: mobileSpace.sm,
    },
    entrySegmentDivider: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      paddingTop: 12,
    },
    entryTitle: {
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
    },
    entryMetaText: {
      ...mobileTextWeighted("meta", "medium"),
      color: mobileColors.textMuted,
    },
  });
