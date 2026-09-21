import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../../shared/components/Text";
import { ScrollableTabStrip } from "../../../../shared/components/ScrollableTabStrip";
import { getScreenGutter } from "../../../../shared/components/screen-layout";
import { useIsDarkMode, useMobileColors } from "../../../../shared/providers/ThemeModeProvider";
import {
  mobileSpace,
  mobileSpacing,
  mobileText,
  type MobileColors,
} from "../../../../shared/theme/tokens";
import { ScheduleDateTile } from "../../../schedule/components/ScheduleDateTile";
import { OpenShiftCard } from "../../../shift-requests/screens/RequestsScreen";
import { createStyles as createRequestsStyles } from "../../../shift-requests/screens/requestsScreenStyles";
import { OnboardingDeviceFrame } from "./OnboardingDeviceFrame";
import {
  PREVIEW_EMPLOYEE_ID,
  PREVIEW_REQUEST_TABS,
  buildPreviewOpenShift,
  getPreviewToday,
} from "./sample-data";

const noop = () => undefined;

/** The Requests tab's Available list with an open shift to volunteer for (`shift-requests/screens/RequestsScreen.tsx`). */
export function CoverShiftsPreview() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const requestsStyles = useMemo(
    () => createRequestsStyles(mobileColors, isDark),
    [mobileColors, isDark],
  );
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const openShift = useMemo(() => buildPreviewOpenShift(getPreviewToday()), []);

  return (
    <OnboardingDeviceFrame>
      <View style={styles.largeTitleBar}>
        <Text fit="fixed" style={styles.largeTitle}>
          Requests
        </Text>
      </View>
      <View style={styles.content}>
        <ScrollableTabStrip
          accessibilityLabel="Request filters"
          activeKey="available"
          onSelect={noop}
          tabs={PREVIEW_REQUEST_TABS}
        />
        <View style={requestsStyles.section}>
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
      </View>
    </OnboardingDeviceFrame>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    // Stands in for the native large-title bar, which the tour cannot host:
    // the app's own headline token, at the bar's inset and bottom padding.
    largeTitleBar: {
      paddingHorizontal: getScreenGutter(),
      paddingTop: mobileSpace["4xl"],
      paddingBottom: mobileSpace.sm,
    },
    largeTitle: {
      ...mobileText.display,
      color: mobileColors.textPrimary,
    },
    content: {
      paddingHorizontal: getScreenGutter(),
      gap: mobileSpacing.sectionGap,
    },
  });
