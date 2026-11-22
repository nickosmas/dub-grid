import { useMemo } from "react";
import { ActivityIndicator, View, type StyleProp, type TextStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import type { MobileScheduleRange } from "@dubgrid/contracts";
import { NumericBadge } from "../../../shared/components/NumericBadge";
import { ChromeIconButton } from "../../../shared/components/ChromeIconButton";
import { Text } from "../../../shared/components/Text";
import { getWeekHeading } from "../lib/week-range-label";
import { Pressable } from "../../../shared/components/Pressable";
import { useHasSideColumn } from "../../../shared/navigation/useHasSideColumn";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { createStyles } from "../screens/scheduleScreenStyles";

export function IconControlButton({
  accessibilityLabel,
  iconName,
  iconSize = 20,
  iconStyle,
  onPress,
}: {
  accessibilityLabel: string;
  iconName: React.ComponentProps<typeof Ionicons>["name"];
  iconSize?: number;
  iconStyle?: StyleProp<TextStyle>;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();

  return (
    <ChromeIconButton accessibilityLabel={accessibilityLabel} onPress={onPress}>
      <Ionicons
        color={mobileColors.textPrimary}
        name={iconName}
        size={iconSize}
        style={iconStyle}
      />
    </ChromeIconButton>
  );
}

export function AlertsChromeButton({ unreadCount }: { unreadCount: number }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <ChromeIconButton
      accessibilityLabel="Open alerts"
      badge={
        <NumericBadge
          count={unreadCount}
          label={`${unreadCount} unread alerts`}
          max={9}
          size="sm"
          style={styles.alertBadge}
          tone="danger"
        />
      }
      onPress={() => router.push("/alerts")}
    >
      <Ionicons color={mobileColors.textPrimary} name="notifications-outline" size={20} />
    </ChromeIconButton>
  );
}

/**
 * Home's header on both homes: the week's name and the week stepper beside
 * the alerts bell, then the week's dates and hours, with Today once the week
 * is not this one. `loading` puts the system's small spinner beside the dates
 * while another week loads, with the page left as it was underneath.
 */
export function WeekNavigatorHeader({
  loading = false,
  todayDate,
  range,
  timeZone,
  hoursLabel = null,
  unreadCount,
  onPreviousWeek,
  onNextWeek,
  onToday,
  controls = true,
}: {
  /** Off beside a split's month, which steps the weeks, and whose bar holds the bell. */
  controls?: boolean;
  loading?: boolean;
  todayDate: string;
  range: MobileScheduleRange;
  timeZone?: string | null;
  /** The week's scheduled hours, "32h scheduled", when there are any. */
  hoursLabel?: string | null;
  unreadCount: number;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  // On an iPhone Duo the arrows, Today and the bell stand in the side column.
  const sideColumn = useHasSideColumn();
  const steps = controls && !sideColumn;
  const heading = getWeekHeading(range, todayDate, timeZone);
  const meta = [heading.dates, hoursLabel].filter(Boolean).join(" · ");

  return (
    <View style={styles.meWeekHeader}>
      <View style={styles.meWeekHeaderRow}>
        <Text accessibilityRole="header" fit="fixed" style={styles.meWeekNavigatorTitle}>
          {heading.title}
        </Text>
        {steps ? (
          <View style={styles.meWeekNavigatorActions}>
            <View style={styles.meWeekRangeControlGroup}>
              <IconControlButton
                accessibilityLabel="Previous week"
                iconName="chevron-back"
                onPress={onPreviousWeek}
              />
              <IconControlButton
                accessibilityLabel="Next week"
                iconName="chevron-forward"
                onPress={onNextWeek}
              />
            </View>
            <AlertsChromeButton unreadCount={unreadCount} />
          </View>
        ) : null}
      </View>
      <View style={styles.meWeekHeaderRow}>
        <View style={styles.meWeekNavigatorRangeRow}>
          {meta ? (
            <Text fit="fixed" style={styles.meWeekNavigatorRangeLabel}>
              {meta}
            </Text>
          ) : null}
          {loading ? (
            <ActivityIndicator
              accessibilityLabel="Loading week"
              color={mobileColors.textSecondary}
              size="small"
              testID="period-loading"
            />
          ) : null}
        </View>
        {steps && !heading.isThisWeek ? (
          <Pressable
            accessibilityLabel="Today"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onToday}
            style={styles.meWeekTodayButton}
          >
            <Text fit="compact" style={styles.meWeekTodayText}>
              Today
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
