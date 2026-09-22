import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { getScreenGutter } from "../../../../shared/components/screen-layout";
import { useIsDarkMode, useMobileColors } from "../../../../shared/providers/ThemeModeProvider";
import { ScheduleDateTile } from "../../../schedule/components/ScheduleDateTile";
import { OpenShiftCard } from "../../../shift-requests/screens/RequestsScreen";
import { createStyles as createRequestsStyles } from "../../../shift-requests/screens/requestsScreenStyles";
import { OnboardingPreviewStage } from "./OnboardingPreviewStage";
import { PREVIEW_EMPLOYEE_ID, buildPreviewOpenShift, getPreviewToday } from "./sample-data";

const noop = () => undefined;

/**
 * One open shift from the Requests tab's Available list
 * (`shift-requests/screens/RequestsScreen.tsx`), fronted by its day tile as
 * on that list; the page's title and tab strip stay behind.
 */
export function CoverShiftsPreview() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const requestsStyles = useMemo(
    () => createRequestsStyles(mobileColors, isDark),
    [mobileColors, isDark],
  );
  const openShift = useMemo(() => buildPreviewOpenShift(getPreviewToday()), []);

  return (
    <OnboardingPreviewStage>
      <View style={[styles.content, requestsStyles.section]}>
        <View style={requestsStyles.dateGroupList}>
          <View style={requestsStyles.dateGroup}>
            <View style={requestsStyles.dateRail}>
              <ScheduleDateTile date={openShift.date} />
              <View pointerEvents="none" style={requestsStyles.dateRailLine} />
            </View>
            <View style={requestsStyles.dateGroupItems}>
              <OpenShiftCard
                linkedEmployeeId={PREVIEW_EMPLOYEE_ID}
                onAction={noop}
                openShift={openShift}
                pendingAction={null}
                showDate={false}
              />
            </View>
          </View>
        </View>
      </View>
    </OnboardingPreviewStage>
  );
}

// The `Screen` shell's own gutter, so the card is exactly as wide as on Requests.
const styles = StyleSheet.create({
  content: {
    paddingHorizontal: getScreenGutter(),
  },
});
