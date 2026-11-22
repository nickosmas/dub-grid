import { useMemo } from "react";
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import { Text } from "../../../shared/components/Text";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { getCalendarMonthTitleParts } from "../lib/schedule";

/** "November 2026" as Calendar writes it: the month, then its year in a lighter gray. */
export function MonthTitle({
  monthStart,
  style,
}: {
  monthStart: string;
  style: StyleProp<TextStyle>;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(
    // The theme's lightest ink, as Calendar's year is.
    () => StyleSheet.create({ year: { color: mobileColors.placeholderText } }),
    [mobileColors],
  );
  const { month, year } = getCalendarMonthTitleParts(monthStart);
  return (
    <Text accessibilityRole="header" fit="fixed" numberOfLines={1} style={style}>
      {month}{" "}
      <Text fit="fixed" style={styles.year}>
        {year}
      </Text>
    </Text>
  );
}
