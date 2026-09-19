import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  SkeletonBlock,
  SkeletonCircle,
  SkeletonGroup,
  SkeletonLine,
  SkeletonPill,
  skeletonRows,
  useSkeletonFillCount,
} from "../../../shared/components/skeleton";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileControl,
  mobileRadii,
  type MobileColors,
  mobileSpace,
} from "../../../shared/theme/tokens";
import { createStyles as createScheduleStyles } from "../screens/scheduleScreenStyles";

/**
 * The staff home: the rounded hero, then the week's card of 132pt rows. No
 * open-shifts strip: it appears only when there are shifts to offer, and a
 * placeholder strip that then vanished dropped the week's card by a whole
 * section on load.
 *
 * Every surface is the screen's own style, borrowed from
 * `scheduleScreenStyles`, so the placeholder cannot drift from the page.
 */
export function ScheduleMeSkeleton({ rows }: { rows?: number }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  // The week's 132pt rows; reserved for the sticky header and the hero.
  const fillRows = useSkeletonFillCount(132, 420);
  const rowCount = rows ?? fillRows;
  const scheduleStyles = useMemo(
    () => createScheduleStyles(mobileColors, isDark),
    [mobileColors, isDark],
  );
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <SkeletonGroup style={scheduleStyles.mePage}>
      {/* The hero as it renders: a status dot with its word, the shift name
          at heroMetric, the type pill under it, the date tile at the right
          edge, then the focus-area and time rows the card closes on. Each
          placeholder sits in the real style so the frame lands where the
          content will. */}
      <View style={[scheduleStyles.meHeroCard, styles.heroFill]}>
        <View style={scheduleStyles.meHeroContent}>
          <View style={scheduleStyles.meHeroHeader}>
            <View style={scheduleStyles.meHeroHeaderCopy}>
              <View style={scheduleStyles.meHeroBadge}>
                <View style={[scheduleStyles.meHeroBadgeDot, styles.heroInk]} />
                <SkeletonLine blockStyle={styles.heroInk} variant="label" width={72} />
              </View>
              <SkeletonLine blockStyle={styles.heroInk} variant="heroMetric" width="64%" />
              <SkeletonPill height={26} style={styles.heroInk} width={96} />
            </View>
            <View style={[scheduleStyles.meHeroDateTile, styles.heroDateTile]}>
              <SkeletonLine blockStyle={styles.heroInk} variant="label" width={28} />
              <SkeletonLine blockStyle={styles.heroInk} variant="heroMetric" width={30} />
            </View>
          </View>
          <View style={scheduleStyles.meHeroContextGroup}>
            <View style={scheduleStyles.meHeroAreaRow}>
              <SkeletonCircle size={18} style={styles.heroInk} />
              <SkeletonLine blockStyle={styles.heroInk} variant="rowTitle" width={128} />
            </View>
            <View style={scheduleStyles.meHeroTimeRow}>
              <SkeletonCircle size={24} style={styles.heroInk} />
              <SkeletonLine blockStyle={styles.heroInk} variant="sectionTitle" width={156} />
            </View>
          </View>
        </View>
      </View>

      <View style={scheduleStyles.upcomingSectionBlock}>
        <View style={scheduleStyles.upcomingSectionHeader}>
          <SkeletonLine variant="sectionTitle" width="46%" style={styles.grow} />
          <SkeletonPill height={mobileControl.sm} width={132} />
        </View>
        <View style={scheduleStyles.upcomingShiftsCard}>
          {skeletonRows(rowCount, (index) => (
            <View
              key={`upcoming-skeleton-${index}`}
              style={[
                scheduleStyles.upcomingShiftRow,
                index > 0 ? scheduleStyles.upcomingShiftRowBorder : null,
              ]}
            >
              <View style={styles.upcomingDateTile} />
              <View style={scheduleStyles.upcomingShiftCopy}>
                <SkeletonLine variant="sectionTitle" width="66%" />
                <SkeletonLine variant="rowTitle" width="48%" />
                <SkeletonLine variant="caption" width="38%" />
              </View>
            </View>
          ))}
        </View>
      </View>
    </SkeletonGroup>
  );
}

/**
 * The team schedule: shift groups, each a card of 72pt member rows with a
 * 48pt avatar, the name, and on some a status badge at the end.
 */
export function ScheduleTeamSkeleton({
  groups = 3,
  rowsPerGroup = 3,
}: {
  groups?: number;
  rowsPerGroup?: number;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const scheduleStyles = useMemo(
    () => createScheduleStyles(mobileColors, isDark),
    [mobileColors, isDark],
  );
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <SkeletonGroup style={scheduleStyles.shiftGroupsList}>
      {skeletonRows(groups, (groupIndex) => (
        <View key={`shift-group-skeleton-${groupIndex}`} style={scheduleStyles.shiftGroupBlock}>
          <View style={scheduleStyles.shiftGroupHeader}>
            <SkeletonLine variant="sectionTitle" width="44%" style={styles.grow} />
            <SkeletonLine variant="bodyStrong" width={84} />
          </View>
          <View style={scheduleStyles.teamGroupCard}>
            {skeletonRows(rowsPerGroup, (rowIndex) => (
              <View
                key={`team-member-skeleton-${groupIndex}-${rowIndex}`}
                style={[
                  scheduleStyles.teamMemberRow,
                  rowIndex > 0 ? scheduleStyles.teamMemberRowBorder : null,
                ]}
              >
                <SkeletonCircle size={48} />
                <View style={styles.teamMemberCopy}>
                  <SkeletonLine variant="rowTitle" width={rowIndex === 1 ? "44%" : "58%"} />
                </View>
                {rowIndex === 0 ? <SkeletonPill height={22} width={92} /> : null}
              </View>
            ))}
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    // A percentage-wide line inside a row has no width of its own to take a
    // percentage of; growing the wrapper gives it the row's free space.
    grow: {
      flex: 1,
    },
    // The real hero paints a brand gradient; a placeholder for it has to be
    // neutral, so it takes the skeleton fill and drops the coloured shadow.
    heroFill: {
      backgroundColor: mobileColors.skeletonBase,
      shadowColor: mobileColors.shadow,
    },
    // Placeholders on the hero's fill are the same tone as the fill, so they
    // take the white the real hero's text and tile carry, faint enough to
    // read as lines rather than labels.
    heroInk: {
      backgroundColor: isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(255, 255, 255, 0.72)",
    },
    heroDateTile: {
      backgroundColor: "transparent",
      borderColor: isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(255, 255, 255, 0.72)",
    },
    upcomingDateTile: {
      backgroundColor: mobileColors.skeletonBase,
      borderRadius: mobileRadii.control,
      height: 68,
      width: 60,
    },
    teamMemberCopy: {
      flex: 1,
      gap: mobileSpace.sm,
      minWidth: 0,
    },
  });
