import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { getCompactScheduleDateParts } from "@dubgrid/schedule-core";
import { Text } from "../../../shared/components/Text";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpace, mobileTextWeighted, type MobileColors } from "../../../shared/theme/tokens";

const DAY_CIRCLE = 36;

/**
 * A day of Home's week as Calendar labels it: the weekday small above the
 * date, today's date in the brand circle the calendars use, days gone by
 * quieter. Fixed text: it is chrome and holds its shape at any text size.
 */
export function WeekDayLabel({
  date,
  isToday = false,
  isPast = false,
  todayTestID,
}: {
  date: string;
  isToday?: boolean;
  isPast?: boolean;
  todayTestID?: string;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const parts = getCompactScheduleDateParts(date);

  return (
    <View style={styles.label} testID={isToday ? todayTestID : undefined}>
      <Text fit="fixed" style={[styles.weekday, isToday && styles.weekdayToday]}>
        {parts.weekdayLabel}
      </Text>
      <View style={[styles.circle, isToday && styles.circleToday]}>
        <Text
          fit="fixed"
          style={[styles.day, isPast && styles.dayPast, isToday && styles.dayToday]}
        >
          {parts.dayLabel}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    label: {
      minWidth: 44,
      alignItems: "center",
      gap: mobileSpace.xs,
    },
    weekday: {
      ...mobileTextWeighted("meta", "semibold"),
      letterSpacing: 0.3,
      color: mobileColors.textSecondary,
    },
    weekdayToday: {
      color: mobileColors.brand,
    },
    circle: {
      width: DAY_CIRCLE,
      height: DAY_CIRCLE,
      borderRadius: DAY_CIRCLE / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    circleToday: {
      backgroundColor: mobileColors.brand,
    },
    day: {
      ...mobileTextWeighted("title", "semibold"),
      color: mobileColors.textPrimary,
    },
    dayPast: {
      color: mobileColors.textSecondary,
    },
    dayToday: {
      color: mobileColors.onBrandText,
    },
  });
