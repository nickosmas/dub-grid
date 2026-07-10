import { StyleSheet, Text, View } from "react-native";
import type { MobileShiftRequest } from "@dubgrid/contracts";
import { Card } from "../../../shared/components/Screen";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { mobileColors, mobileText } from "../../../shared/theme/tokens";
import { formatUsDate } from "../../../shared/lib/dates";
import { CountBadge, type CountBadgeTone } from "./CountBadge";
import { ExpandableList } from "./ExpandableList";

const REQUEST_TYPE_LABEL: Record<MobileShiftRequest["type"], string> = {
  pickup: "Pickup",
  swap: "Swap",
  calloff: "Time off",
};

const REQUEST_TYPE_TONE: Record<MobileShiftRequest["type"], CountBadgeTone> = {
  pickup: "brand",
  swap: "success",
  calloff: "warning",
};

export function ActionQueueCard({ requests }: { requests: MobileShiftRequest[] }) {
  return (
    <Card
      title="Pending approvals"
      icon="checkmark-done-outline"
      iconTone="brand"
      headerAccessory={
        requests.length > 0 ? <CountBadge label={String(requests.length)} tone="brand" /> : undefined
      }
      detail={
        requests.length > 0 ? (
          <ExpandableList
            title="Pending approvals"
            items={requests}
            keyExtractor={(request) => request.id}
            renderItem={(request) => (
              <View style={styles.row}>
                <CountBadge label={REQUEST_TYPE_LABEL[request.type]} tone={REQUEST_TYPE_TONE[request.type]} />
                <View style={styles.copy}>
                  <Text style={styles.label}>{request.requesterName}</Text>
                  <Text style={styles.meta}>
                    {request.requesterPresentation.label} shift · {formatUsDate(request.requesterShiftDate)}
                  </Text>
                </View>
              </View>
            )}
          />
        ) : (
          <EmptyStateCard compact iconName="checkmark-circle-outline" title="No requests are waiting on you" />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  copy: {
    flexShrink: 1,
    gap: 2,
  },
  label: {
    ...mobileText.body,
    color: mobileColors.textPrimary,
    flexShrink: 1,
  },
  meta: {
    ...mobileText.caption,
    color: mobileColors.textMuted,
  },
});
