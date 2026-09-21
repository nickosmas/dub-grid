import { useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "../../../../shared/components/Text";
import { PageWash } from "../../../../shared/components/PageWash";
import { getScreenGutter } from "../../../../shared/components/screen-layout";
import { useIsDarkMode, useMobileColors } from "../../../../shared/providers/ThemeModeProvider";
import {
  mobileSoftGradientStops,
  mobileSpace,
  mobileSpacing,
} from "../../../../shared/theme/tokens";
import {
  formatScheduleDayLabel,
  formatScheduleRange,
  getScheduleRangeForDate,
} from "../../../schedule/lib/schedule";
import { getHeroTiming } from "../../../schedule/lib/scheduleScreenHelpers";
import {
  AlertsChromeButton,
  IconControlButton,
  MeHeroCard,
} from "../../../schedule/screens/ScheduleScreen";
import { createStyles as createScheduleStyles } from "../../../schedule/screens/scheduleScreenStyles";
import { OnboardingDeviceFrame } from "./OnboardingDeviceFrame";
import {
  PREVIEW_EMPLOYEE_ID,
  PREVIEW_SHIFTMATES,
  PREVIEW_TIME,
  buildPreviewScheduleEntry,
  getPreviewToday,
} from "./sample-data";

const noop = () => undefined;

/** The My schedule screen with today's shift on duty (`schedule/screens/ScheduleScreen.tsx`). */
export function UpcomingShiftPreview() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const { height: windowHeight } = useWindowDimensions();
  const scheduleStyles = useMemo(
    () => createScheduleStyles(mobileColors, isDark),
    [mobileColors, isDark],
  );
  const styles = useMemo(() => createStyles(), []);
  const sample = useMemo(() => {
    const today = getPreviewToday();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const entry = buildPreviewScheduleEntry(PREVIEW_EMPLOYEE_ID, "You", today);
    const segment = entry.presentation.segments[0]!;

    return {
      dateLabel: formatScheduleDayLabel(today, new Date(), timeZone),
      rangeLabel: formatScheduleRange(getScheduleRangeForDate(today), timeZone),
      featuredItem: { key: `${entry.employeeId}-${today}`, date: today, entry, segment },
      timing: getHeroTiming(
        entry,
        segment.startTime,
        segment.endTime,
        "active",
        today,
        PREVIEW_TIME,
      ),
      shiftmates: PREVIEW_SHIFTMATES.map(([id, name]) =>
        buildPreviewScheduleEntry(id, name, today),
      ),
      today,
    };
  }, []);

  return (
    <OnboardingDeviceFrame
      background={
        <PageWash colors={mobileSoftGradientStops("aurora", isDark)} height={windowHeight} />
      }
    >
      <View style={styles.stickyHeader}>
        <View style={scheduleStyles.meWeekNavigator}>
          <View style={scheduleStyles.meWeekNavigatorCopy}>
            <Text fit="fixed" style={scheduleStyles.meWeekNavigatorTitle}>
              {sample.dateLabel}
            </Text>
            <Text fit="fixed" style={scheduleStyles.meWeekNavigatorRangeLabel}>
              {sample.rangeLabel}
            </Text>
          </View>
          <View style={scheduleStyles.meWeekNavigatorActions}>
            <View style={scheduleStyles.meWeekRangeControlGroup}>
              <IconControlButton
                accessibilityLabel="Previous week"
                iconName="chevron-back"
                onPress={noop}
              />
              <IconControlButton
                accessibilityLabel="Next week"
                iconName="chevron-forward"
                onPress={noop}
              />
            </View>
            <AlertsChromeButton unreadCount={8} />
          </View>
        </View>
      </View>
      <View style={[styles.content, scheduleStyles.mePage]}>
        <MeHeroCard
          currentDate={sample.today}
          currentTime={PREVIEW_TIME}
          featuredItem={sample.featuredItem}
          shiftmates={sample.shiftmates}
          status="active"
          timing={sample.timing}
        />
      </View>
    </OnboardingDeviceFrame>
  );
}

// The `Screen` shell's sticky header and content paddings, at the top inset
// the status bar above already took. The wash runs through the header on
// Home, and nothing scrolls under it here, so the shell has no fill.
const createStyles = () =>
  StyleSheet.create({
    stickyHeader: {
      paddingHorizontal: getScreenGutter(),
      paddingTop: mobileSpace.sm,
      paddingBottom: mobileSpace.lg,
    },
    content: {
      paddingHorizontal: getScreenGutter(),
      paddingTop: mobileSpacing.sectionGap,
    },
  });
