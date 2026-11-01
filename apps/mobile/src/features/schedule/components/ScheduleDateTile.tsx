import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileRadii,
  mobileSpace,
  mobileTabularText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { getCompactScheduleDateParts } from "../lib/schedule";

/**
 * The tile's box, shared with the columns that reserve room for it and the
 * skeletons that stand in for it, so none of them drifts from the tile.
 */
export const SCHEDULE_DATE_TILE_MIN_WIDTH = 60;
export const SCHEDULE_DATE_TILE_MIN_HEIGHT = 68;

/**
 * The calendar tile that fronts a day: weekday over day number in a framed
 * box, filled with the brand colour when the day is today (owner, 2026-11-01:
 * no red dot for today). Home's Your Week rows and the
 * Requests feed's date rail draw the same tile, so a date reads the same
 * wherever a list is grouped by day. Fixed text: the tile is chrome and holds
 * its shape at any OS text size.
 */
export function ScheduleDateTile({
  date,
  isToday = false,
  accessibilityLabel,
  todayTestID,
}: {
  date: string;
  isToday?: boolean;
  accessibilityLabel?: string;
  todayTestID?: string;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const parts = getCompactScheduleDateParts(date);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[styles.tile, isToday && styles.tileToday]}
      testID={isToday ? todayTestID : undefined}
    >
      <Text fit="fixed" style={[styles.weekday, isToday && styles.textToday]}>
        {parts.weekdayLabel}
      </Text>
      <Text fit="fixed" style={[styles.day, isToday && styles.textToday]}>
        {parts.dayLabel}
      </Text>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    tile: {
      minWidth: SCHEDULE_DATE_TILE_MIN_WIDTH,
      minHeight: SCHEDULE_DATE_TILE_MIN_HEIGHT,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
      gap: mobileSpace.sm,
    },
    weekday: {
      ...mobileTextWeighted("badge", "semibold"),
      color: mobileColors.textSubtle,
    },
    day: {
      ...mobileTextWeighted("title", "bold"),
      ...mobileTabularText,
      color: mobileColors.textSecondary,
    },
    tileToday: {
      backgroundColor: mobileColors.brand,
      borderColor: mobileColors.brand,
    },
    textToday: {
      color: mobileColors.onBrandText,
    },
  });
