import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Screen } from "../../../src/shared/components/Screen";
import { StatusBanner } from "../../../src/shared/components/StatusBanner";
import { EmptyStateCard } from "../../../src/shared/components/EmptyStateCard";
import { ActionQueueRow } from "../../../src/features/dashboard/components/ActionQueueCard";
import { DashboardListSkeleton } from "../../../src/features/dashboard/components/DashboardSkeleton";
import { useExpandedDashboardQuery } from "../../../src/features/dashboard/hooks/useExpandedDashboardQuery";
import { useMobileContentState } from "../../../src/shared/hooks/useMobileContentState";
import { useMobileColors } from "../../../src/shared/providers/ThemeModeProvider";
import { type MobileColors } from "../../../src/shared/theme/tokens";

// No filter UI — there's no web "expanded" panel for pending approvals to
// mirror, so this ships as a plain full list.
export default function PendingApprovalsExpandedScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { dashboardQuery, bootstrapQuery } = useExpandedDashboardQuery();
  const contentState = useMobileContentState({
    hasData: dashboardQuery.data !== undefined,
    isLoading: dashboardQuery.isLoading || bootstrapQuery.isLoading,
    error: dashboardQuery.error ?? bootstrapQuery.error,
  });

  if (contentState.kind === "loading") {
    return (
      <Screen bottomPaddingMode="tabbed">
        {contentState.showSkeleton ? (
          <DashboardListSkeleton rows={3} showFilterHeader={false} variant="badgeLead" />
        ) : null}
      </Screen>
    );
  }

  if (contentState.kind === "error") {
    return (
      <Screen bottomPaddingMode="tabbed">
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
    <Screen bottomPaddingMode="tabbed">
      {requests.length === 0 ? (
        <EmptyStateCard
          iconName="checkmark-circle-outline"
          title="No requests are waiting on you"
        />
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

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    list: {
      gap: 16,
      paddingTop: 12,
    },
  });
