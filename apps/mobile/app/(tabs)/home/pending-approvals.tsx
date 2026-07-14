import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../../../src/shared/components/Screen";
import { ListSkeleton } from "../../../src/shared/components/Skeleton";
import { StatusBanner } from "../../../src/shared/components/StatusBanner";
import { EmptyStateCard } from "../../../src/shared/components/EmptyStateCard";
import { ActionQueueRow } from "../../../src/features/dashboard/components/ActionQueueCard";
import { useExpandedDashboardQuery } from "../../../src/features/dashboard/hooks/useExpandedDashboardQuery";
import { getMobileQueryContentState } from "../../../src/shared/lib/query-state";
import { mobileColors, mobileText } from "../../../src/shared/theme/tokens";

// No filter UI — there's no web "expanded" panel for pending approvals to
// mirror, so this ships as a plain full list.
export default function PendingApprovalsExpandedScreen() {
  const { dashboardQuery, bootstrapQuery } = useExpandedDashboardQuery();
  const contentState = getMobileQueryContentState({
    hasData: dashboardQuery.data !== undefined,
    isLoading: dashboardQuery.isLoading || bootstrapQuery.isLoading,
    error: dashboardQuery.error ?? bootstrapQuery.error,
  });

  if (contentState.kind === "loading") {
    return (
      <Screen title="Pending approvals" bottomPaddingMode="tabbed">
        <View style={styles.loadingState}>
          <Text style={styles.loadingTitle}>Loading pending approvals</Text>
          <ListSkeleton rows={3} showSectionHeader={false} />
        </View>
      </Screen>
    );
  }

  if (contentState.kind === "error") {
    return (
      <Screen title="Pending approvals" bottomPaddingMode="tabbed">
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load pending approvals"
          variant="centered"
          onAction={() => {
            void dashboardQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  if (!dashboardQuery.data) {
    return null;
  }

  const requests = dashboardQuery.data.actionQueue;

  return (
    <Screen title="Pending approvals" bottomPaddingMode="tabbed">
      {requests.length === 0 ? (
        <EmptyStateCard iconName="checkmark-circle-outline" title="No requests are waiting on you" />
      ) : (
        <View style={styles.list}>
          {requests.map((request) => (
            <ActionQueueRow key={request.id} request={request} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    gap: 14,
  },
  loadingTitle: {
    ...mobileText.screenTitle,
    color: mobileColors.textPrimary,
  },
  list: {
    gap: 16,
    paddingTop: 12,
  },
});
