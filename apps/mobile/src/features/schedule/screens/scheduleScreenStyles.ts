import { StyleSheet } from "react-native";
import {
  mobileOnAccent,
  mobilePillOverflow,
  mobileAvatarText,
  mobileElevation,
  mobileElevationExtent,
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
import { getScreenGutter } from "../../../shared/components/screen-layout";
import { IS_NATIVE_LIST } from "../../../shared/lib/native-list";
import { HERO_INVERSE_CHIP_BORDER, HERO_INVERSE_CHIP_FILL } from "../lib/heroCardTheme";
import { SCHEDULE_DATE_TILE_MIN_WIDTH } from "../components/ScheduleDateTile";

/**
 * Fixed pixel geometry shared by the screen and its stylesheet.
 */

const PRESSABLE_INSET = mobileSpace.sm;

/** A rounded press highlight that reaches past the content on both sides. */
const pressableBleed = {
  borderRadius: mobileRadii.control,
  marginHorizontal: -PRESSABLE_INSET,
  overflow: "hidden" as const,
  paddingHorizontal: PRESSABLE_INSET,
};

export const OPEN_SHIFT_CARD_MIN_HEIGHT = 180;
/**
 * The hero's collaborator stack: each avatar sits in a frame painted the
 * block's own navy, and the frame is exactly the avatar plus the ring, so
 * where frames overlap the ring reads as a clean cut-out of the neighbour.
 * The old 42pt frame held a 38pt avatar behind 4pt of padding, which left
 * 34pt of room: every avatar spilled out of its own ring off-centre and the
 * cut-outs became uneven crescents.
 */
export const ME_HERO_AVATAR_SIZE = 38;
export const ME_HERO_AVATAR_RING = 3;
export const ME_HERO_AVATAR_FRAME_SIZE = ME_HERO_AVATAR_SIZE + ME_HERO_AVATAR_RING * 2;
export const ME_HERO_AVATAR_FRAME_OVERLAP = -12;
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
const TEAM_MEMBER_AVATAR_SIZE = 48;
const TEAM_MEMBER_ROW_GAP = 16;

/**
 * A group's header: the platforms' prominent 17pt semibold on device, the
 * larger drawn heading on the web build.
 */
const meGroupTitle = IS_NATIVE_LIST ? mobileText.cardTitle : mobileTextWeighted("title", "bold");

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
    meWeekNavigatorRangeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
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
    // The shadow lives on this view and the clip on the one inside: iOS clips
    // a view's own shadow when it also clips its children, which is why the
    // hero's blue glow never rendered there.
    meHeroCard: {
      position: "relative",
      borderRadius: mobileRadii.card,
      shadowOffset: {
        width: 0,
        height: 14,
      },
      shadowOpacity: 1,
      shadowRadius: 28,
      elevation: 5,
    },
    meHeroCardClip: {
      overflow: "hidden",
      borderRadius: mobileRadii.card,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.lg,
    },
    meHeroCardPressed: {
      opacity: 0.94,
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
    // A light neutral like its green and blue siblings: the hero is the same
    // deep blue in every status, where `textMuted` grey all but disappeared.
    meHeroBadgeDotMuted: {
      backgroundColor: "#CBD5E1",
    },
    meHeroBadgeText: {
      ...mobileText.label,
      color: mobileColors.textInverse,
      textTransform: "uppercase",
    },
    meHeroDateTile: {
      minWidth: 58,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      borderColor: mobileOnAccent.hairline,
      backgroundColor: mobileOnAccent.fill,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: 8,
    },
    meHeroDateWeekday: {
      ...mobileText.label,
      color: mobileOnAccent.tertiary,
    },
    meHeroDateDay: {
      ...mobileText.heroMetric,
      ...mobileTabularText,
      color: mobileColors.textInverse,
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
    meHeroAreaLabel: {
      ...mobileText.rowTitle,
      color: mobileOnAccent.secondary,
    },
    meHeroAreaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
    },
    meHeroNotesRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: mobileSpace.sm,
    },
    // Centres the 20pt icon on the names' first line, as the focus-area row does.
    meHeroNotesIcon: {
      marginTop: Math.max(((mobileText.rowTitle.lineHeight ?? 20) - 20) / 2, 0),
    },
    meHeroNotesList: {
      flex: 1,
      minWidth: 0,
    },
    meHeroContextGroup: {
      gap: 8,
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
      ...mobileText.meta,
      color: mobileColors.textSubtle,
    },
    previousShiftTextInverse: {
      color: mobileOnAccent.secondary,
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
      color: mobileOnAccent.secondary,
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
    meHeroProgressLabel: {
      ...mobileText.rowTitle,
      color: mobileOnAccent.secondary,
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
      borderColor: mobileOnAccent.hairline,
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
      color: mobileOnAccent.secondary,
      flexShrink: 1,
    },
    meHeroAvatarStack: {
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 0,
    },
    meHeroCollaboratorAvatarFrame: {
      width: ME_HERO_AVATAR_FRAME_SIZE,
      height: ME_HERO_AVATAR_FRAME_SIZE,
      borderRadius: ME_HERO_AVATAR_FRAME_SIZE / 2,
      padding: ME_HERO_AVATAR_RING,
    },
    meHeroCollaboratorAvatarFrameOverlap: {
      marginLeft: ME_HERO_AVATAR_FRAME_OVERLAP,
    },
    meHeroCollaboratorAvatar: {
      width: ME_HERO_AVATAR_SIZE,
      height: ME_HERO_AVATAR_SIZE,
      borderRadius: ME_HERO_AVATAR_SIZE / 2,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    meHeroCollaboratorAvatarText: {
      ...mobileAvatarText(ME_HERO_AVATAR_SIZE),
    },
    // A pale disc reads on the light navy block, but the same grey vanished
    // against the dark theme's deeper navy, so dark mode lightens the block
    // like the hero's other chips instead.
    meHeroCollaboratorOverflow: {
      width: ME_HERO_AVATAR_SIZE,
      height: ME_HERO_AVATAR_SIZE,
      borderRadius: ME_HERO_AVATAR_SIZE / 2,
      borderWidth: 1,
      borderColor: isDark ? HERO_INVERSE_CHIP_BORDER : mobileColors.borderSubtle,
      backgroundColor: isDark ? HERO_INVERSE_CHIP_FILL : mobileColors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    meHeroCollaboratorOverflowText: {
      ...mobileText.bodyStrong,
      color: isDark ? mobileColors.textInverse : mobileColors.textMuted,
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
      paddingHorizontal: IS_NATIVE_LIST ? mobileSpace.lg : 0,
    },
    upcomingSectionTitle: {
      ...meGroupTitle,
      flex: 1,
      color: mobileColors.textPrimary,
    },
    // The week's hours as the header's trailing detail, plain text the way a
    // grouped list puts a count beside its header.
    upcomingHoursText: {
      ...mobileText.body,
      ...mobileTabularText,
      color: mobileColors.textSecondary,
    },
    upcomingShiftsCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: mobileColors.cardBorder,
      paddingHorizontal: 20,
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
      minWidth: SCHEDULE_DATE_TILE_MIN_WIDTH,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: mobileSpace.lg,
    },
    upcomingDateShiftStack: {
      flex: 1,
      minWidth: 0,
    },
    // Rows and card surfaces that navigate take the same rounded highlight
    // as every other pressable row: it bleeds past the content by the inset
    // and gives it back as padding, so the text stays where it was.
    // The tap area is inset the same 8 from the dividers, the date tile and
    // the card's edge (the card pads 20, the tile's gap is 16), and pads its
    // content the same 12 on every side, so its press highlight sits evenly.
    upcomingShiftRow: {
      minHeight: 116,
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.lg,
      marginVertical: mobileSpace.sm,
      marginLeft: -mobileSpace.sm,
      marginRight: -mobileSpace.md,
      padding: mobileSpace.md,
      borderRadius: mobileRadii.control,
      overflow: "hidden",
    },
    upcomingUnscheduledRow: {
      minHeight: 132,
      justifyContent: "center",
      gap: 4,
      paddingVertical: mobileSpace.lg,
    },
    upcomingWhatChanged: {
      alignSelf: "stretch",
      marginTop: mobileSpace.sm,
    },
    upcomingDeletedHistoryRow: {
      paddingVertical: mobileSpace.md,
    },
    upcomingUnscheduledTitle: {
      ...mobileTextWeighted("cardTitle", "bold"),
      color: mobileColors.textSecondary,
    },
    // Above every day but the first, inset to the card's content on both
    // sides as a grouped list's separators are. Laid over the day's top edge,
    // since the day itself bleeds to the card's edges for today's tint.
    upcomingDaySeparator: {
      position: "absolute",
      top: 0,
      left: 20,
      right: 20,
      height: StyleSheet.hairlineWidth,
      backgroundColor: mobileColors.borderSubtle,
    },
    // Between shifts on one day: the same hairline, starting at the shift's
    // text rather than under the date tile.
    upcomingShiftDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: mobileColors.borderSubtle,
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
    // Regular weight so the focus area reads as detail under the bold shift
    // name rather than as a second heading, as it does on the Requests card.
    upcomingShiftArea: {
      ...mobileText.body,
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
      ...meGroupTitle,
      color: mobileColors.textPrimary,
    },
    // A grouped list's header starts on the rows' text line, not the card edge.
    meGroupHeading: {
      paddingHorizontal: IS_NATIVE_LIST ? mobileSpace.lg : 0,
    },
    meSectionLink: {
      ...mobileText.bodyStrong,
      color: mobileColors.brand,
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
      ...mobileText.body,
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
      ...mobileText.body,
      ...mobileTabularText,
      color: mobileColors.textMuted,
    },
    // A horizontal ScrollView clips to its bounds, so the card shadow needs
    // the token's own reach below the last card or it ends in a hard line.
    // Runs to the screen's edges and starts its first card on the page's
    // gutter, so the cards scroll out from under the edge like the App
    // Store's shelves. The cards are flat, so no room is kept for a shadow.
    openShiftCarousel: {
      marginHorizontal: -getScreenGutter(),
    },
    openShiftCarouselContent: {
      gap: mobileSpace.md,
      paddingHorizontal: getScreenGutter(),
    },
    openShiftDateCard: {
      width: 320,
      gap: 12,
    },
    // Inset from the card below it the way a grouped list's section title
    // is, so the date sits over the card's content rather than on its edge.
    openShiftDateHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: mobileSpace.lg,
    },
    // Grows to the carousel's tallest day, so every card is one height and
    // each Claim row sits on the same line.
    openShiftDateCardItems: {
      flexGrow: 1,
      gap: mobileSpace.md,
    },
    // The day sheet sits on the grouped gray, so its cards are the same flat
    // white cards as the page's.
    openShiftSheetList: {
      gap: mobileSpace.md,
    },
    openShiftCard: {
      flexGrow: 1,
      minHeight: OPEN_SHIFT_CARD_MIN_HEIGHT,
      gap: 12,
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: mobileColors.cardBorder,
      padding: mobileSpace.lg,
    },
    // The card's action rows supply its bottom edge, and the card clips the
    // last row's press highlight to its corners.
    cardWithActionRows: {
      paddingBottom: 0,
      overflow: "hidden",
    },
    // Sinks a card's action rows to its foot when the card is taller than its
    // content, as the carousel's equal-height cards are.
    cardActionRowsFoot: {
      marginTop: "auto",
    },
    openShiftCardSurface: {
      gap: 12,
      ...pressableBleed,
      marginVertical: -PRESSABLE_INSET,
      paddingVertical: PRESSABLE_INSET,
    },
    openShiftSplitPanel: {
      gap: mobileSpace.md,
    },
    requestList: {
      gap: mobileSpace.md,
    },
    requestCard: {
      gap: mobileSpace.md,
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: mobileColors.cardBorder,
      padding: mobileSpace.lg,
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
    // A tinted fill with no outline, as the platforms draw a status capsule.
    jobPill: {
      ...mobilePillOverflow.displayContainer,
      alignSelf: "flex-start",
      borderRadius: mobileRadius.md,
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
      ...mobileText.meta,
    },
    // The ramp floors at 13pt, the smallest a capsule's words may be.
    jobPillEyebrowTextCompact: {
      fontSize: mobileText.meta.fontSize,
    },
    // Sentence case at a readable size, as the platforms' own tag capsules.
    jobPillText: {
      ...mobileTextWeighted("meta", "semibold"),
      ...mobilePillOverflow.displayText,
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
    },
    jobPillMentoredInlineTextCompact: {
      fontSize: mobileText.meta.fontSize,
      lineHeight: mobileText.meta.lineHeight,
    },
    jobPillTextCompact: {
      fontSize: mobileText.meta.fontSize,
      lineHeight: mobileText.meta.lineHeight,
    },
    jobPillValueText: {
      ...mobileTextWeighted("meta", "semibold"),
      ...mobilePillOverflow.displayText,
    },
    jobPillValueTextCompact: {
      fontSize: mobileText.meta.fontSize,
    },
    mentoredPill: {
      ...mobilePillOverflow.displayContainer,
      alignSelf: "flex-start",
      borderRadius: mobileRadius.md,
      backgroundColor: mobileColors.controlNeutralBg,
      minHeight: 28,
      justifyContent: "center",
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.xs,
    },
    mentoredPillText: {
      ...mobileText.meta,
      ...mobilePillOverflow.displayText,
      color: mobileColors.textSecondary,
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
    // Ionicons draws its circular arrow clockwise; flipped, it points back.
    iconControlMirrored: {
      transform: [{ scaleX: -1 }],
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
      ...mobileTextWeighted("meta", "semibold"),
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
    // Today is the brand colour, not red (owner, 2026-11-01): a soft tint on
    // its own, filled once it is also the selected day.
    dateHighlightTodaySelected: {
      backgroundColor: mobileColors.brand,
      borderColor: mobileColors.brand,
    },
    dateHighlightToday: {
      backgroundColor: mobileColors.controlSecondaryBg,
      borderColor: mobileColors.controlSecondaryBg,
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
      color: mobileColors.brand,
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
      // On the card's text line, as a grouped list's header is.
      paddingHorizontal: mobileSpace.lg,
    },
    shiftGroupTitle: {
      flex: 1,
      minWidth: 0,
      ...meGroupTitle,
      color: mobileColors.textPrimary,
    },
    shiftGroupTime: {
      flexShrink: 0,
      ...mobileText.bodyStrong,
      ...mobileTabularText,
      color: mobileColors.textSubtle,
      textAlign: "right",
    },
    shiftGroupHeaderStacked: {
      flexDirection: "column",
      alignItems: "stretch",
      gap: mobileSpace.xs,
    },
    shiftGroupTimeStacked: {
      textAlign: "left",
    },
    // A grouped list's section: flat on the page, a hairline only in dark mode,
    // and the rows' own padding for its height.
    teamGroupCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: mobileColors.cardBorder,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.xs,
    },
    teamGroupMembers: {
      marginTop: 0,
    },
    teamMemberRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: TEAM_MEMBER_ROW_GAP,
      minHeight: 72,
      paddingVertical: 16,
      ...pressableBleed,
    },
    // Between rows only, starting at the name rather than under the avatar.
    teamMemberSeparator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: TEAM_MEMBER_AVATAR_SIZE + TEAM_MEMBER_ROW_GAP,
      backgroundColor: mobileColors.borderSubtle,
    },
    teamMemberAvatar: {
      width: TEAM_MEMBER_AVATAR_SIZE,
      height: TEAM_MEMBER_AVATAR_SIZE,
      borderRadius: TEAM_MEMBER_AVATAR_SIZE / 2,
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
    teamMemberCopy: {
      flex: 1,
      minWidth: 0,
      gap: mobileSpace.xs,
    },
    teamMemberHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    teamMemberNameRow: {
      flex: 1,
      minWidth: 0,
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
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      flexWrap: "wrap",
      gap: 8,
    },
    // Under the name at a raised text size, where a trailing pill squeezed
    // the name column until "Richard Bennett" broke and the split-shift
    // badge truncated beside it.
    teamMemberRoleRowStacked: {
      justifyContent: "flex-start",
    },
  });
