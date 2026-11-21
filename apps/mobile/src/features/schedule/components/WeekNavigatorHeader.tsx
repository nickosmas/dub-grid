import { useMemo } from "react";
import { ActivityIndicator, View, type StyleProp, type TextStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import type { MobileScheduleRange } from "@dubgrid/contracts";
import { formatScheduleDayLabel, formatScheduleRange } from "@dubgrid/schedule-core";
import { NumericBadge } from "../../../shared/components/NumericBadge";
import { ChromeIconButton } from "../../../shared/components/ChromeIconButton";
import { Text } from "../../../shared/components/Text";
import { compactSameMonthRange } from "../lib/week-range-label";
import { NARROW_LIST_MAX_WIDTH } from "../../../shared/layout/split-layout";
import { useSplitLayout } from "../../../shared/layout/SplitView";
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
 * Home's header on both homes: the chosen day, its week, the week stepper and
 * the alerts bell. `loading` puts the system's small spinner beside the week
 * while another week loads, with the page left as it was underneath.
 */
export function WeekNavigatorHeader({
  loading = false,
  selectedDate,
  todayDate,
  range,
  now,
  timeZone,
  unreadCount,
  onPreviousWeek,
  onNextWeek,
  onToday,
  controls = true,
}: {
  /** Off beside a split's month, which steps the weeks, and whose bar holds the bell. */
  controls?: boolean;
  loading?: boolean;
  selectedDate: string;
  todayDate: string;
  range: MobileScheduleRange;
  now: Date;
  timeZone?: string | null;
  unreadCount: number;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  // The Today control's arrow points the way today lies: back from a future
  // week, forward from a past one. Ionicons only draws the clockwise arrow,
  // which reads as forward, so the backward one is that glyph mirrored.
  const todayIconStyle = selectedDate > todayDate ? styles.iconControlMirrored : undefined;
  // In the narrow list of an iPhone Duo held tall, three controls leave the
  // date too little room for one line, so it wraps rather than truncating.
  const split = useSplitLayout();
  const sideColumn = useHasSideColumn();
  const wraps = split !== null && split.listWidth < NARROW_LIST_MAX_WIDTH;
  const titleFit = wraps
    ? ({ allowFontScaling: false, numberOfLines: 2 } as const)
    : ({ fit: "fixed" } as const);

  return (
    <View style={styles.meWeekNavigator}>
      <View style={styles.meWeekNavigatorCopy}>
        {/* Both shrink rather than wrap or truncate: a header is one row,
            and a date is bounded text that fits at the default size. */}
        <Text {...titleFit} style={styles.meWeekNavigatorTitle}>
          {formatScheduleDayLabel(selectedDate, now, timeZone)}
        </Text>
        <View style={styles.meWeekNavigatorRangeRow}>
          <Text
            fit="fixed"
            style={[
              styles.meWeekNavigatorRangeLabel,
              wraps && styles.meWeekNavigatorRangeLabelNarrow,
            ]}
          >
            {wraps
              ? compactSameMonthRange(formatScheduleRange(range, timeZone))
              : formatScheduleRange(range, timeZone)}
          </Text>
          {loading ? (
            <ActivityIndicator
              accessibilityLabel="Loading week"
              color={mobileColors.textSecondary}
              size="small"
              testID="period-loading"
            />
          ) : null}
        </View>
      </View>
      {controls ? (
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
          {/* Icon-only, like the chevrons beside it: with the word "Today" this
            row held five controls and the date title was cut to "Sat, Sep…"
            on any week but the current one. A circular arrow, "return to
            today"; a calendar glyph read as a date picker. */}
          {selectedDate !== todayDate ? (
            <IconControlButton
              accessibilityLabel="Today"
              iconName="refresh-outline"
              iconStyle={todayIconStyle}
              onPress={onToday}
            />
          ) : null}
          {/* On an iPhone Duo the bell stands in the side column instead. */}
          {sideColumn ? null : <AlertsChromeButton unreadCount={unreadCount} />}
        </View>
      ) : null}
    </View>
  );
}
