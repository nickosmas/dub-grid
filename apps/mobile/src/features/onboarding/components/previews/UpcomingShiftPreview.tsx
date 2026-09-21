import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { getScreenGutter } from "../../../../shared/components/screen-layout";
import { getHeroTiming } from "../../../schedule/lib/scheduleScreenHelpers";
import { MeHeroCard } from "../../../schedule/screens/ScheduleScreen";
import { OnboardingPreviewStage } from "./OnboardingPreviewStage";
import {
  PREVIEW_EMPLOYEE_ID,
  PREVIEW_SHIFTMATES,
  PREVIEW_TIME,
  buildPreviewScheduleEntry,
  getPreviewToday,
} from "./sample-data";

/**
 * My schedule's hero card with today's shift on duty
 * (`schedule/screens/ScheduleScreen.tsx`), on its own: the tour's aurora
 * backdrop is the one Home sits on, and the page's header stays behind.
 */
export function UpcomingShiftPreview() {
  const sample = useMemo(() => {
    const today = getPreviewToday();
    const entry = buildPreviewScheduleEntry(PREVIEW_EMPLOYEE_ID, "You", today);
    const segment = entry.presentation.segments[0]!;

    return {
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
    <OnboardingPreviewStage>
      <View style={styles.content}>
        <MeHeroCard
          currentDate={sample.today}
          currentTime={PREVIEW_TIME}
          featuredItem={sample.featuredItem}
          shiftmates={sample.shiftmates}
          status="active"
          timing={sample.timing}
        />
      </View>
    </OnboardingPreviewStage>
  );
}

// The `Screen` shell's own gutter, so the card is exactly as wide as on Home.
const styles = StyleSheet.create({
  content: {
    paddingHorizontal: getScreenGutter(),
  },
});
