import { StyleSheet } from "react-native";
import {
  mobileElevation,
  mobileMotion,
  mobileRadii,
  mobileSpacing,
  mobileText,
  mobileTextWeighted,
  mobileTypography,
  type MobileColors,
} from "../../../shared/theme/tokens";

/**
 * Fixed pixel geometry shared by the screen and its stylesheet.
 */
export const MAX_VISIBLE_OPEN_SHIFT_STACK_CARDS = 4;
export const OPEN_SHIFT_CARD_MIN_HEIGHT = 180;
export const OPEN_SHIFT_CARD_SHADOW_ALLOWANCE = 18;
export const ME_HERO_AVATAR_FRAME_OVERLAP = -10;
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
export const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    stickyControlsSection: {
      gap: 16,
    },
    scheduleCalendarStickyHeaderShell: {
      // Everything this used to restate — the fill, the shadow, the Android
      // elevation — now comes from `Screen`'s own `stickyHeaderShell`, which
      // paints the bar `surface` and lifts it at the `raised` level. Overriding
      // the fill here is what made this header the one that stayed page-colored
      // when that shell went white, and the local `elevation: 2` quietly undid
      // the shell's draw-order fix, letting `card`-level tiles paint over the
      // bar on Android.
      //
      // What is left is the one thing the schedule genuinely needs differently:
      // a thinner but darker divider. The grid scrolling under this bar is far
      // denser than the dashboard's stack of cards, and `borderSubtle` gets
      // lost against it.
      borderBottomWidth: 0.5,
      borderBottomColor: mobileColors.border,
    },
    mePage: {
      gap: 22,
      paddingTop: 8,
    },
    mePageEmpty: {
      justifyContent: "center",
      paddingTop: 0,
    },
    meTopStack: {
      gap: 18,
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
      color: mobileColors.textSubtle,
    },
    meWelcomeTitle: {
      ...mobileText.sectionTitle,
      fontSize: 20,
      lineHeight: 25,
      color: mobileColors.textPrimary,
    },
    meWeekNavigator: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 14,
    },
    meWeekNavigatorCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    meWeekNavigatorTitle: {
      ...mobileTextWeighted("sectionTitle", "bold"),
      fontSize: 26,
      lineHeight: 32,
      color: mobileColors.textPrimary,
    },
    meWeekNavigatorRangeLabel: {
      ...mobileText.bodyStrong,
      color: mobileColors.textSecondary,
    },
    meWeekNavigatorActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
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
      minHeight: 36,
      borderRadius: mobileRadii.pill,
      // Same outlined chrome as `iconControlButton`, which it sits beside — the
      // two are one row of header controls and have to read as one set.
      borderWidth: 1,
      borderColor: mobileColors.border,
      backgroundColor: mobileColors.surface,
      justifyContent: "center",
      paddingHorizontal: 14,
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
      borderRadius: 24,
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
      gap: 11,
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
      gap: 10,
    },
    meHeroBadge: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
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
    meHeroDateWeekday: {
      ...mobileText.label,
      color: "rgba(255, 255, 255, 0.72)",
    },
    meHeroDateDay: {
      ...mobileText.heroMetric,
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
    meHeroTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
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
      marginTop: 2,
    },
    meHeroRoleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    meTypePillStack: {
      alignSelf: "flex-start",
      gap: 4,
    },
    meTypePillLabel: {
      ...mobileText.rowTitle,
      color: mobileColors.textMuted,
    },
    meTypePillLabelRow: {
      fontSize: 17,
      lineHeight: 22,
    },
    meTypePillLabelHero: {
      fontSize: 24,
      lineHeight: 30,
    },
    meTypePillLabelInverse: {
      color: "rgba(255, 255, 255, 0.82)",
    },
    meHeroScheduleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 6,
    },
    meHeroTimeRow: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 9,
      minWidth: 0,
    },
    meHeroTimeText: {
      ...mobileText.sectionTitle,
      color: mobileColors.textInverse,
      flexShrink: 1,
    },
    meHeroTimePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      alignSelf: "flex-start",
      backgroundColor: "rgba(29, 78, 216, 0.22)",
      borderRadius: mobileRadii.control,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    meHeroTimePillMuted: {
      backgroundColor: "rgba(255, 255, 255, 0.58)",
    },
    meHeroTimePillText: {
      ...mobileText.bodyStrong,
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
      gap: 10,
    },
    meHeroEmptyTextMuted: {
      color: mobileColors.textSecondary,
    },
    meHeroDetails: {
      gap: 8,
    },
    meHeroDetailText: {
      color: "rgba(255, 255, 255, 0.88)",
      fontFamily: mobileTypography.fontFamily.semibold,
      fontSize: 14,
      lineHeight: 20,
    },
    meHeroDetailTextMuted: {
      color: mobileColors.textSecondary,
    },
    meHeroProgressBlock: {
      gap: 10,
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
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.14)",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 9,
      marginTop: 6,
      marginBottom: 6,
    },
    meHeroCollaboratorLabelRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
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
      padding: 2,
    },
    meHeroCollaboratorAvatarFrameOverlap: {
      marginLeft: ME_HERO_AVATAR_FRAME_OVERLAP,
    },
    meHeroCollaboratorAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: "#2946C7",
      alignItems: "center",
      justifyContent: "center",
    },
    meHeroCollaboratorAvatarText: {
      ...mobileTextWeighted("meta", "semibold"),
    },
    meHeroCollaboratorOverflow: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: "#93C5FD",
      backgroundColor: "#DBEAFE",
      alignItems: "center",
      justifyContent: "center",
    },
    meHeroCollaboratorOverflowText: {
      ...mobileText.bodyStrong,
      color: "#1D4ED8",
    },
    meSectionBlock: {
      gap: 12,
    },
    upcomingSectionBlock: {
      gap: 18,
    },
    upcomingSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 14,
    },
    upcomingSectionTitle: {
      ...mobileText.sectionTitle,
      fontSize: 18,
      lineHeight: 24,
      flex: 1,
      color: mobileColors.textPrimary,
    },
    upcomingHoursBadge: {
      borderRadius: 12,
      backgroundColor: mobileColors.brandSoft,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    upcomingHoursBadgeText: {
      ...mobileText.bodyStrong,
      color: mobileColors.brand,
    },
    upcomingShiftsCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      paddingHorizontal: 20,
      shadowColor: mobileColors.shadow,
      shadowOffset: {
        width: 0,
        height: 12,
      },
      shadowOpacity: 1,
      shadowRadius: 24,
      elevation: 3,
    },
    upcomingDateGroup: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 18,
      marginHorizontal: -20,
      paddingHorizontal: 20,
    },
    upcomingDateColumn: {
      width: 60,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 18,
    },
    upcomingDateShiftStack: {
      flex: 1,
      minWidth: 0,
    },
    upcomingShiftRow: {
      minHeight: 132,
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
      paddingVertical: 18,
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
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
    },
    upcomingShiftRowTodayLast: {
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    upcomingDateTile: {
      width: 60,
      minHeight: 68,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    upcomingDateWeekday: {
      ...mobileText.micro,
      color: mobileColors.textSubtle,
      fontSize: 11,
      lineHeight: 14,
    },
    upcomingDateDay: {
      ...mobileText.sectionTitle,
      fontSize: 20,
      lineHeight: 24,
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
      gap: 9,
    },
    upcomingShiftTitleRow: {
      // flex-start (not center) so the time stays pinned to the title's first
      // line instead of drifting to the vertical middle when a long shift name
      // wraps to two lines.
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 8,
    },
    upcomingShiftTitleMeta: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    upcomingShiftTitle: {
      flexShrink: 1,
      minWidth: 0,
      ...mobileText.sectionTitle,
      fontSize: 17,
      color: mobileColors.textPrimary,
    },
    upcomingShiftArea: {
      ...mobileText.rowTitle,
      color: mobileColors.textSecondary,
    },
    upcomingShiftTime: {
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      // upcomingShiftTitle's line-height (sectionTitle preset) adds leading
      // space above its glyphs that this shorter icon+text row doesn't have —
      // nudge down so it lines up with the title's actual text, not its box top.
      paddingTop: 3,
    },
    // Smaller and lighter than upcomingShiftTitle (17px) — the time is
    // secondary to the shift name, not competing with it for attention.
    upcomingShiftTimeText: {
      ...mobileText.caption,
      fontSize: 13,
      lineHeight: 18,
      color: mobileColors.textSubtle,
    },
    upcomingShiftAction: {
      width: 24,
      alignItems: "center",
      justifyContent: "center",
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
      ...mobileText.sectionTitle,
      fontSize: 18,
      lineHeight: 24,
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
      padding: 18,
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
      color: mobileColors.textMuted,
    },
    scheduleRowTitle: {
      ...mobileText.sectionTitle,
      fontSize: 17,
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
      gap: 14,
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
      gap: 14,
      paddingBottom: OPEN_SHIFT_CARD_SHADOW_ALLOWANCE,
    },
    openShiftDateCardItemsStacked: {
      gap: 0,
      minHeight: OPEN_SHIFT_CARD_MIN_HEIGHT,
      position: "relative",
    },
    openShiftCountBadge: {
      minWidth: 28,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      borderColor: mobileColors.brandBorder,
      backgroundColor: mobileColors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    openShiftCountBadgeText: {
      ...mobileText.badge,
      color: mobileColors.brand,
    },
    openShiftCard: {
      minHeight: OPEN_SHIFT_CARD_MIN_HEIGHT,
      gap: 12,
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      padding: 18,
      shadowColor: mobileColors.shadow,
      shadowOffset: {
        width: 0,
        height: 8,
      },
      shadowOpacity: 1,
      shadowRadius: 18,
      elevation: 2,
    },
    openShiftCardSurface: {
      gap: 12,
    },
    openShiftSplitPanel: {
      gap: 10,
    },
    openShiftCardLead: {
      zIndex: MAX_VISIBLE_OPEN_SHIFT_STACK_CARDS + 1,
    },
    openShiftCardStacked: {
      position: "absolute",
      shadowRadius: 14,
    },
    requestList: {
      gap: 14,
    },
    requestCard: {
      gap: 14,
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      padding: 18,
      shadowColor: mobileColors.shadow,
      shadowOffset: {
        width: 0,
        height: 8,
      },
      shadowOpacity: 1,
      shadowRadius: 18,
      elevation: 2,
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
      ...mobileText.bodyStrong,
    },
    requestHeaderText: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    requestHeaderTextStack: {
      flex: 1,
      gap: 2,
    },
    requestHeaderSubtext: {
      ...mobileTextWeighted("meta", "semibold"),
      color: mobileColors.textSecondary,
    },
    requestDateText: {
      ...mobileText.bodyStrong,
      color: mobileColors.textMuted,
    },
    requestActions: {
      flexDirection: "row",
      gap: 12,
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
    },
    jobPillEyebrowTextCompact: {
      fontSize: 9,
    },
    jobPillText: {
      ...mobileText.badge,
      textTransform: "uppercase",
    },
    jobPillMentoredText: {
      textTransform: "none",
    },
    jobPillTextCompact: {
      fontSize: 12,
      lineHeight: 16,
    },
    jobPillValueText: {
      ...mobileTextWeighted("meta", "semibold"),
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
    meCollaboratorAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: mobileColors.brandSoft,
      borderWidth: 1,
      borderColor: mobileColors.brandBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    meCollaboratorAvatarText: {
      ...mobileTextWeighted("meta", "semibold"),
      color: mobileColors.brand,
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
      gap: 18,
    },
    timelineSection: {
      gap: 12,
      paddingLeft: 18,
      marginLeft: 4,
      borderLeftWidth: 2,
      borderLeftColor: mobileColors.borderSubtle,
    },
    timelineSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginLeft: -25,
    },
    timelineDot: {
      width: 12,
      height: 12,
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
      gap: 10,
    },
    timelineEntryCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: 22,
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
      gap: 10,
    },
    teamHeaderUtilityRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      justifyContent: "space-between",
    },
    teamHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginLeft: "auto",
      flexShrink: 0,
      overflow: "visible",
    },
    teamHeaderTitleArea: {
      flex: 1,
      minWidth: 0,
    },
    meSelectedDateTitle: {
      ...mobileTextWeighted("sectionTitle", "bold"),
      fontSize: 26,
      lineHeight: 32,
      flex: 1,
      color: mobileColors.textPrimary,
      textAlign: "left",
    },
    teamHeaderTitle: {
      ...mobileTextWeighted("sectionTitle", "bold"),
      fontSize: 26,
      lineHeight: 32,
      color: mobileColors.textPrimary,
      textAlign: "left",
      flexShrink: 1,
      minWidth: 0,
    },
    iconControlButton: {
      width: 44,
      height: 44,
      borderRadius: mobileRadii.pill,
      // Outlined chrome: the week chevrons and the alerts bell share this, and
      // both sit *on* the header bar, which is now the same `surface` they are.
      // So the edge is the control — `border` (1.49:1 on white, 1.39:1 on the
      // dark bar), not `borderSubtle`, which at 1.23:1 leaves a 44pt target
      // reading as a floating icon with no button around it.
      borderWidth: 1,
      borderColor: mobileColors.border,
      backgroundColor: mobileColors.surface,
      alignItems: "center",
      justifyContent: "center",
      // Down from `card`. A 12pt-blur shadow under a white pill on a white bar
      // reads as a smudge, and with the outline above it there are two
      // separators doing one job. `raised` keeps the control from looking
      // printed on without competing with its own edge.
      ...mobileElevation("raised", isDark),
    },
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
      paddingVertical: 2,
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
      gap: 6,
    },
    monthCalendarWeekdayLabel: {
      flex: 1,
      color: mobileColors.textSubtle,
      fontFamily: mobileTypography.fontFamily.bold,
      fontSize: 12,
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
      gap: 6,
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
      color: mobileColors.textPrimary,
      fontFamily: mobileTypography.fontFamily.bold,
      fontSize: 15,
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
      minWidth: 16,
      minHeight: 16,
      borderRadius: 999,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.danger,
    },
    alertBadgeText: {
      ...mobileText.micro,
      color: mobileColors.textInverse,
    },
    groupsList: {
      gap: mobileSpacing.sectionGap,
    },
    shiftGroupsList: {
      gap: 28,
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
      ...mobileText.sectionTitle,
      fontSize: 18,
      lineHeight: 23,
      color: mobileColors.textPrimary,
    },
    shiftGroupTime: {
      flexShrink: 0,
      ...mobileText.bodyStrong,
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
      ...mobileText.sectionTitle,
      fontSize: 17,
      color: mobileColors.textPrimary,
    },
    weekDayEmptyState: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    weekDayEmptyText: {
      ...mobileTextWeighted("body", "semibold"),
      color: mobileColors.textMuted,
    },
    groupEntries: {
      gap: 10,
    },
    teamGroupCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      paddingHorizontal: 20,
      paddingVertical: 10,
      shadowColor: mobileColors.shadowStrong,
      shadowOffset: {
        width: 0,
        height: 8,
      },
      shadowOpacity: 1,
      shadowRadius: 20,
      elevation: 2,
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
      ...mobileText.bodyStrong,
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
      gap: 5,
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
      borderRadius: 7,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    teamMemberRoleChipTextStack: {
      gap: 2,
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
      gap: 3,
    },
    compactSegmentDivider: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      paddingTop: 8,
    },
    compactSegmentTitle: {
      color: mobileColors.textSecondary,
      fontFamily: mobileTypography.fontFamily.bold,
      fontSize: 13,
    },
    compactSegmentMeta: {
      color: mobileColors.textMuted,
      fontFamily: mobileTypography.fontFamily.semibold,
      fontSize: 13,
    },
    heroSegmentList: {
      gap: 12,
    },
    heroSegmentBlock: {
      gap: 6,
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
      gap: 6,
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
