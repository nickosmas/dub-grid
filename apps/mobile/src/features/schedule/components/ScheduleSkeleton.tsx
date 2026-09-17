import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  SkeletonBlock,
  SkeletonCircle,
  SkeletonGroup,
  SkeletonLine,
  SkeletonPill,
  skeletonRows,
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
 * The staff home: the rounded hero, the open-shifts strip, then the week's
 * card of 132pt rows.
 *
 * Every surface is the screen's own style, borrowed from
 * `scheduleScreenStyles`, so the placeholder cannot drift from the page.
 */
export function ScheduleMeSkeleton({ rows = 3 }: { rows?: number }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const scheduleStyles = useMemo(
    () => createScheduleStyles(mobileColors, isDark),
    [mobileColors, isDark],
  );
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <SkeletonGroup style={scheduleStyles.mePage}>
      <View style={[scheduleStyles.meHeroCard, styles.heroFill]}>
        <View style={scheduleStyles.meHeroContent}>
          <View style={scheduleStyles.meHeroHeader}>
            <View style={scheduleStyles.meHeroHeaderCopy}>
              <SkeletonPill height={24} width={124} />
              <SkeletonLine variant="heroMetric" width="72%" />
              <SkeletonLine variant="body" width="54%" />
            </View>
            <View style={styles.heroDateTile} />
          </View>
          <View style={scheduleStyles.meHeroProgressBlock}>
            <View style={scheduleStyles.meHeroProgressRow}>
              <SkeletonLine variant="rowTitle" width={96} />
              <SkeletonLine variant="rowTitle" width={48} />
            </View>
            <View style={styles.heroProgressTrack} />
          </View>
        </View>
      </View>

      <View style={scheduleStyles.upcomingSectionBlock}>
        <View style={scheduleStyles.upcomingSectionHeader}>
          <SkeletonLine variant="sectionTitle" width="40%" style={styles.grow} />
          <SkeletonLine variant="label" width={52} />
        </View>
        <View style={styles.openShiftStrip}>
          {skeletonRows(2, (index) => (
            <View
              key={`open-shift-skeleton-${index}`}
              style={[scheduleStyles.openShiftCard, styles.openShiftCardFill]}
            >
              <SkeletonLine variant="cardTitle" width="56%" />
              <SkeletonLine variant="body" width="48%" />
              <SkeletonLine variant="body" width="62%" />
              <SkeletonLine variant="meta" width="54%" />
              <SkeletonPill height={mobileControl.md} />
            </View>
          ))}
        </View>
      </View>

      <View style={scheduleStyles.upcomingSectionBlock}>
        <View style={scheduleStyles.upcomingSectionHeader}>
          <SkeletonLine variant="sectionTitle" width="46%" style={styles.grow} />
          <SkeletonPill height={mobileControl.sm} width={132} />
        </View>
        <View style={scheduleStyles.upcomingShiftsCard}>
          {skeletonRows(rows, (index) => (
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
  groups = 2,
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
    // The real hero paints a brand gradient; a placeholder for it has to be
    // neutral, so it takes the skeleton fill and drops the coloured shadow.
    heroFill: {
      backgroundColor: mobileColors.skeletonBase,
      shadowColor: mobileColors.shadow,
    },
    heroDateTile: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.control,
      height: 64,
      minWidth: 58,
      opacity: 0.4,
    },
    heroProgressTrack: {
      backgroundColor: mobileColors.surface,
      borderRadius: 999,
      height: 7,
      opacity: 0.4,
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
    // Two cards of the strip, the second cut by the screen edge as it is at
    // rest; the strip does not scroll while it is a placeholder.
    openShiftStrip: {
      flexDirection: "row",
      gap: mobileSpace.md,
      overflow: "hidden",
    },
    openShiftCardFill: {
      width: 320,
      backgroundColor: mobileColors.surface,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
    },
  });
