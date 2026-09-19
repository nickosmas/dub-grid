import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useIsDarkMode, useMobileColors } from "../../providers/ThemeModeProvider";
import {
  mobileControl,
  mobileElevation,
  mobileRadii,
  mobileSpace,
  type MobileColors,
} from "../../theme/tokens";
import {
  SkeletonBlock,
  SkeletonGroup,
  SkeletonLine,
  SkeletonPill,
  skeletonRows,
} from "./primitives";

// The Requests feed's date tile, as `ScheduleDateTile` draws it.
const DATE_TILE_WIDTH = 60;
const DATE_TILE_HEIGHT = 68;

/**
 * The request card list, as the Requests tabs and a shift's own request list
 * draw it: a 16-radius card whose header carries the title with a status
 * chip at the far end, two lines of detail, then a hairline and one control
 * (Volunteer, Approve). One placeholder for every tab so none drifts.
 * `dateRail` fronts the cards with the Available feed's date tiles and the
 * line that joins them, two cards on the first day and one on each after.
 */
export function CardRowListSkeleton({
  rows = 4,
  showActions = true,
  dateRail = false,
}: {
  rows?: number;
  showActions?: boolean;
  dateRail?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  const cards = skeletonRows(rows, (index) => (
    <View key={`card-row-skeleton-${index}`} style={styles.card}>
      <View style={styles.header}>
        <SkeletonLine
          variant="cardTitle"
          width={index % 2 === 0 ? "44%" : "56%"}
          style={styles.grow}
        />
        <SkeletonPill height={24} width={88} />
      </View>
      <SkeletonLine variant="body" width="46%" />
      <SkeletonLine variant="meta" width="64%" />
      {showActions ? (
        <View style={styles.actions}>
          <SkeletonPill height={mobileControl.md} width={128} />
        </View>
      ) : null}
    </View>
  ));

  if (!dateRail) {
    return <SkeletonGroup style={styles.list}>{cards}</SkeletonGroup>;
  }

  const groups = [cards.slice(0, 2), ...cards.slice(2).map((card) => [card])].filter(
    (group) => group.length > 0,
  );

  return (
    <SkeletonGroup>
      {groups.map((group, index) => (
        <View key={`card-rail-skeleton-${index}`} style={styles.railGroup}>
          <View style={styles.rail}>
            <SkeletonBlock
              height={DATE_TILE_HEIGHT}
              radius={mobileRadii.control}
              width={DATE_TILE_WIDTH}
            />
            {index < groups.length - 1 ? <View style={styles.railLine} /> : null}
          </View>
          <View style={styles.list}>{group}</View>
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
    list: {
      flex: 1,
      minWidth: 0,
      gap: mobileSpace.md,
    },
    // Mirrors the Requests feed's `dateGroup`, `dateRail` and `dateRailLine`.
    railGroup: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: mobileSpace.md,
      paddingBottom: mobileSpace.lg,
    },
    rail: {
      alignItems: "center",
      gap: mobileSpace.xs,
    },
    railLine: {
      flex: 1,
      width: 2,
      borderRadius: 999,
      backgroundColor: mobileColors.borderSubtle,
      marginBottom: -mobileSpace.lg + mobileSpace.xs,
    },
    card: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      gap: mobileSpace.md,
      padding: mobileSpace.lg,
      ...mobileElevation("card", isDark),
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
      justifyContent: "space-between",
    },
    actions: {
      borderTopColor: mobileColors.borderSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: mobileSpace.md,
    },
  });
