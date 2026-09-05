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
import { mobileRadii, type MobileColors } from "../../../shared/theme/tokens";
import { createStyles as createScheduleStyles } from "../screens/scheduleScreenStyles";

/**
 * The personal schedule: the rounded hero, then the upcoming-shifts card.
 *
 * Both surfaces are the screen's own styles, borrowed from
 * `scheduleScreenStyles`. The hero is a gradient card and the upcoming list a
 * card with 132pt rows, neither of which the old flat-bar skeleton resembled.
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
          <SkeletonLine variant="sectionTitle" width="46%" />
          <SkeletonBlock height={38} radius={12} width={92} />
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
              <View style={scheduleStyles.upcomingShiftAction}>
                <SkeletonLine variant="body" width={12} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </SkeletonGroup>
  );
}

/**
 * The team schedule: shift groups, each a 28-radius card of 72pt member rows
 * with the 48pt round arrow on the right.
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
            <SkeletonLine variant="sectionTitle" width="44%" />
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
                <SkeletonCircle size={44} />
                <View style={styles.teamMemberCopy}>
                  <SkeletonLine variant="rowTitle" width="58%" />
                  <SkeletonLine variant="caption" width="40%" />
                </View>
                <View style={styles.rowArrow} />
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
      gap: 6,
      minWidth: 0,
    },
    rowArrow: {
      backgroundColor: mobileColors.skeletonBase,
      borderRadius: 24,
      height: 48,
      width: 48,
    },
  });
