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
import { SCHEDULE_DATE_TILE_MIN_HEIGHT, SCHEDULE_DATE_TILE_MIN_WIDTH } from "./ScheduleDateTile";

/**
 * The staff home: the rounded hero, then the week's card of 132pt rows. No
 * open-shifts strip: it appears only when there are shifts to offer, and a
 * placeholder strip that then vanished dropped the week's card by a whole
 * section on load.
 *
 * Every surface is the screen's own style, borrowed from
 * `scheduleScreenStyles`, so the placeholder cannot drift from the page.
 */
/**
 * The hero with a status word, a title and a type pill beside its date tile.
 * A shift that also lists its focus area and time runs taller; the rectangle
 * promises the least and the card grows into place.
 */
const ME_HERO_SKELETON_HEIGHT = 116;

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
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <SkeletonGroup style={scheduleStyles.mePage}>
      {/* The hero is one rectangle. The real card is a brand gradient with
          white text on it, and a placeholder cannot paint either: drawn as
          lines on the grey fill it read as a broken card in light mode. The
          block takes the hero's radius and its usual height. */}
      <SkeletonBlock height={ME_HERO_SKELETON_HEIGHT} radius={mobileRadii.card} />

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
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

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

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    // A percentage-wide line inside a row has no width of its own to take a
    // percentage of; growing the wrapper gives it the row's free space.
    grow: {
      flex: 1,
    },
    upcomingDateTile: {
      backgroundColor: mobileColors.skeletonBase,
      borderRadius: mobileRadii.control,
      height: SCHEDULE_DATE_TILE_MIN_HEIGHT,
      width: SCHEDULE_DATE_TILE_MIN_WIDTH,
    },
    teamMemberCopy: {
      flex: 1,
      gap: mobileSpace.sm,
      minWidth: 0,
    },
  });
