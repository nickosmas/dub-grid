import { StyleSheet, View } from "react-native";
import { Screen } from "../../../src/shared/components/Screen";
import { LoadingScreen } from "../../../src/shared/components/LoadingScreen";
import { QueryStateCard } from "../../../src/shared/components/QueryStateCard";
import { EmptyStateCard } from "../../../src/shared/components/EmptyStateCard";
import { ActionQueueRow } from "../../../src/features/dashboard/components/ActionQueueCard";
import { useExpandedDashboardQuery } from "../../../src/features/dashboard/hooks/useExpandedDashboardQuery";

// No filter UI — there's no web "expanded" panel for pending approvals to
// mirror, so this ships as a plain full list.
export default function PendingApprovalsExpandedScreen() {
  const { dashboardQuery, bootstrapQuery } = useExpandedDashboardQuery();

  if (dashboardQuery.isLoading || bootstrapQuery.isLoading) {
    return (
      <LoadingScreen
        title="Loading pending approvals"
        body="Getting the latest for your organization."
      />
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <Screen title="Pending approvals" bottomPaddingMode="tabbed">
        <QueryStateCard
          title="Couldn't load pending approvals"
          body="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            void dashboardQuery.refetch();
          }}
        />
      </Screen>
    );
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
  list: {
    gap: 16,
    paddingTop: 12,
  },
});
