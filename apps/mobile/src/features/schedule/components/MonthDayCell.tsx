import { useMemo } from "react";
import { View } from "react-native";
import { Pressable } from "../../../shared/components/Pressable";
import { Text } from "../../../shared/components/Text";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { createStyles } from "../screens/scheduleScreenStyles";

export type MonthDayCellDay = {
  date: string;
  dayLabel: string;
  isToday: boolean;
  isSelected: boolean;
  isCurrentMonth?: boolean;
};

// Shared by the week strip's single row and the full month grid so the
// highlight is always the same circle, in the same place, at the same size.
export function MonthDayCell({
  day,
  dateLabel,
  isScheduled = false,
  onPress,
  accessible = true,
  minHeight,
}: {
  day: MonthDayCellDay;
  /** Human-readable date, e.g. "Today, Apr 16" — see the label below. */
  dateLabel: string;
  /** The person works a shift that day, marked with a dot under the date. */
  isScheduled?: boolean;
  onPress: () => void;
  // The week-swipe strip always keeps the previous/next week mounted
  // off-screen (clipped horizontally) so a swipe can start instantly. Those
  // copies duplicate a week that's already accessible in the full month
  // grid, so they're excluded from the accessibility tree.
  accessible?: boolean;
  /** Split, each week's height, so the month fills the list pane as in Calendar. */
  minHeight?: number;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <Pressable
      // `day.date` is a raw ISO string; screen readers announce it digit by
      // digit ("Select date 2026-08-03"). Speak it the way the UI reads it.
      accessibilityLabel={
        accessible ? `Select ${dateLabel}${isScheduled ? ", you're scheduled" : ""}` : undefined
      }
      accessibilityRole={accessible ? "button" : undefined}
      accessibilityState={accessible ? { selected: day.isSelected } : undefined}
      android_ripple={{ color: mobileColors.rippleNeutral, borderless: true }}
      onPress={onPress}
      style={[styles.monthCalendarDaySlot, minHeight != null && { minHeight }]}
    >
      <View
        style={[
          styles.dateHighlightCircle,
          day.isSelected && !day.isToday && styles.dateHighlightSelected,
          day.isSelected && day.isToday && styles.dateHighlightTodaySelected,
          day.isToday && !day.isSelected && styles.dateHighlightToday,
          day.isCurrentMonth === false && styles.dateHighlightOutsideMonth,
        ]}
      >
        <Text
          fit="fixed"
          style={[
            styles.dateHighlightText,
            day.isSelected && !day.isToday && styles.dateHighlightTextSelected,
            day.isToday && !day.isSelected && styles.dateHighlightTextToday,
            day.isSelected && day.isToday && styles.dateHighlightTextTodaySelected,
          ]}
        >
          {day.dayLabel}
        </Text>
      </View>
      {isScheduled ? (
        <View
          style={[
            styles.dateScheduledDot,
            day.isSelected && styles.dateScheduledDotSelected,
            day.isCurrentMonth === false && styles.dateHighlightOutsideMonth,
          ]}
        />
      ) : null}
    </Pressable>
  );
}
