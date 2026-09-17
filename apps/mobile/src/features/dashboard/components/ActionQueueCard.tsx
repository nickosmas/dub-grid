import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MobileShiftRequest } from "@dubgrid/contracts";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { PressableRow } from "../../../shared/components/PressableRow";
import { Card } from "../../../shared/components/Screen";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileListRow,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { formatUsDate } from "../../../shared/lib/dates";
import { REQUEST_TYPE_LABEL, REQUEST_TYPE_TONE } from "../../shift-requests/lib/request-type";
import { CountBadge } from "./CountBadge";
import { DashboardRowList } from "./DashboardRowList";

export { REQUEST_TYPE_LABEL, REQUEST_TYPE_TONE };

// Shared with the full-page expanded pending-approvals screen
// (apps/mobile/app/(tabs)/home/pending-approvals.tsx). Owns its navigation so
// the card preview and the full list land in the same place: the Requests
// tab's Approval list, which is where the request is acted on.
export function ActionQueueRow({ request }: { request: MobileShiftRequest }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <PressableRow
      accessibilityLabel={`${request.requesterName}, ${REQUEST_TYPE_LABEL[request.type]} request`}
      onPress={() =>
        router.push({
          pathname: "/(tabs)/requests",
          params: { tab: "approval", requestId: request.id },
        })
      }
      style={styles.row}
    >
      <CountBadge label={REQUEST_TYPE_LABEL[request.type]} tone={REQUEST_TYPE_TONE[request.type]} />
      <View style={styles.copy}>
        <Text style={styles.label}>{request.requesterName}</Text>
        <Text style={styles.meta}>
          {request.requesterPresentation.label} shift · {formatUsDate(request.requesterShiftDate)}
        </Text>
      </View>
      <Ionicons color={mobileColors.textMuted} name="chevron-forward" size={16} />
    </PressableRow>
  );
}

export function ActionQueueCard({
  requests,
  onSeeAll,
}: {
  requests: MobileShiftRequest[];
  onSeeAll?: () => void;
}) {
  return (
    <Card
      title="Pending approvals"
      onSeeAll={onSeeAll}
      headerAccessory={
        requests.length > 0 ? (
          <CountBadge label={String(requests.length)} tone="brand" />
        ) : undefined
      }
      detail={
        requests.length > 0 ? (
          <DashboardRowList
            items={requests}
            keyExtractor={(request) => request.id}
            limit={3}
            renderItem={(request) => <ActionQueueRow request={request} />}
          />
        ) : (
          <EmptyStateCard
            compact
            iconName="checkmark-circle-outline"
            title="No requests are waiting on you"
          />
        )
      }
    />
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
      paddingVertical: mobileListRow.paddingVertical,
    },
    copy: {
      flex: 1,
      gap: mobileListRow.titleGap,
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
