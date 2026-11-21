import type { MobileNotification } from "@dubgrid/contracts";
import { getScheduleRangeForDate } from "@dubgrid/schedule-core";
import { StyleSheet, View } from "react-native";
import { AppText } from "../../../shared/components/AppText";
import { Button } from "../../../shared/components/Button";
import { Screen } from "../../../shared/components/Screen";
import { PaneTitle } from "../../../shared/layout/PaneTitle";
import { useRealtimeNow } from "../../../shared/hooks/useRealtimeNow";
import { mobileSpace } from "../../../shared/theme/tokens";
import PersonDetailScreen from "../../people/screens/PersonDetailScreen";
import { DayOverview } from "../../schedule/components/DayOverview";
import ShiftDetailScreen from "../../schedule/screens/ShiftDetailScreen";
import {
  WEB_ONLY_ALERT_MESSAGE,
  openNativeRoute,
  type NativeRoute,
} from "../lib/openNotificationAction";

/** Where a route opens, said on the button that opens it. */
function openLabel(pathname: string): string {
  if (pathname.startsWith("/(tabs)/requests")) return "Open in Requests";
  if (pathname.startsWith("/(tabs)/team")) return "Open the schedule";
  if (pathname.startsWith("/(tabs)/people")) return "Open in People";
  if (pathname.startsWith("/(tabs)/profile")) return "Open in Profile";
  return "Open";
}

/**
 * What an alert points to, beside Alerts on an open iPhone Duo: a shift's
 * page, a person's page or a day's overview inline, dated since the alert
 * may not say the day; anything else is the alert itself with a way to
 * open where it leads.
 */
export function AlertPane({
  notification,
  route,
}: {
  notification: MobileNotification;
  route: NativeRoute | null;
}) {
  const now = useRealtimeNow();
  const params = route?.params ?? {};

  if (route?.pathname === "/shift/[employeeId]/[date]" && params.employeeId && params.date) {
    return (
      <ShiftDetailScreen
        key={`${params.employeeId}:${params.date}`}
        embedded
        showDate
        shift={{
          employeeId: params.employeeId,
          date: params.date,
          rangeStart: params.rangeStart ?? params.date,
          rangeEnd: params.rangeEnd ?? params.date,
          source: params.source === "team" ? "team" : "mine",
        }}
      />
    );
  }
  if (route?.pathname === "/(tabs)/people/[id]" && params.id) {
    return <PersonDetailScreen key={params.id} embedded personId={params.id} />;
  }
  if (route?.pathname === "/(tabs)/team" && params.date) {
    return (
      <DayOverview
        key={params.date}
        date={params.date}
        now={now}
        range={getScheduleRangeForDate(params.date)}
        showDate
        showRoster
      />
    );
  }

  return (
    <Screen bottomPaddingMode="stack">
      <View style={styles.heading}>
        <PaneTitle eyebrow={formatAlertWhen(notification.createdAt)} title={notification.title} />
        {notification.message ? (
          <AppText tone="secondary" variant="body">
            {notification.message}
          </AppText>
        ) : null}
      </View>
      <View style={styles.action}>
        {route ? (
          <Button label={openLabel(route.pathname)} onPress={() => openNativeRoute(route)} />
        ) : (
          <AppText tone="secondary" variant="meta">
            {WEB_ONLY_ALERT_MESSAGE}
          </AppText>
        )}
      </View>
    </Screen>
  );
}

/** When the alert arrived, as the pane's eyebrow: "Nov 8, 3:12 PM". */
function formatAlertWhen(createdAt: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

const styles = StyleSheet.create({
  heading: {
    gap: mobileSpace.xs,
  },
  action: {
    alignItems: "flex-start",
    paddingTop: mobileSpace.sm,
  },
});
