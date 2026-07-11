import { Fragment, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../../../src/shared/components/Screen";
import { LoadingScreen } from "../../../src/shared/components/LoadingScreen";
import { QueryStateCard } from "../../../src/shared/components/QueryStateCard";
import { EmptyStateCard } from "../../../src/shared/components/EmptyStateCard";
import {
  FilterButton,
  FilterSheet,
  SelectionRow,
  SelectionSection,
} from "../../../src/shared/components/FilterSheet";
import {
  ACTIVITY_TYPE_LABEL,
  ActivityRow,
  type ActivityType,
} from "../../../src/features/dashboard/components/ActivityFeedCard";
import { useExpandedDashboardQuery } from "../../../src/features/dashboard/hooks/useExpandedDashboardQuery";
import { mobileColors, mobileText } from "../../../src/shared/theme/tokens";

const ACTIVITY_TYPES: ActivityType[] = ["publish", "shift_change", "request", "user_signup"];
type TypeFilter = "all" | ActivityType;

export default function ActivityExpandedScreen() {
  const { dashboardQuery, bootstrapQuery } = useExpandedDashboardQuery();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  if (dashboardQuery.isLoading || bootstrapQuery.isLoading) {
    return (
      <LoadingScreen title="Loading activity" body="Getting the latest for your organization." />
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <Screen title="Recent activity" bottomPaddingMode="tabbed">
        <QueryStateCard
          title="Couldn't load activity"
          body="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            void dashboardQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  const items = dashboardQuery.data.activity;
  const filtered = typeFilter === "all" ? items : items.filter((item) => item.type === typeFilter);
  const activeFilterCount = typeFilter === "all" ? 0 : 1;

  return (
    <Screen title="Recent activity" bottomPaddingMode="tabbed">
      <FilterSheet
        clearDisabled={activeFilterCount === 0}
        title="Filter activity"
        onClearAll={() => setTypeFilter("all")}
        onDismiss={() => setIsFilterVisible(false)}
        onDone={() => setIsFilterVisible(false)}
        visible={isFilterVisible}
      >
        <SelectionSection label="Type">
          <SelectionRow
            label="All activity"
            onPress={() => setTypeFilter("all")}
            selected={typeFilter === "all"}
          />
          {ACTIVITY_TYPES.map((type) => (
            <SelectionRow
              key={type}
              label={ACTIVITY_TYPE_LABEL[type]}
              onPress={() => setTypeFilter(type)}
              selected={typeFilter === type}
            />
          ))}
        </SelectionSection>
      </FilterSheet>

      <View style={styles.headerRow}>
        <Text style={styles.count}>
          {filtered.length} {filtered.length === 1 ? "event" : "events"}
        </Text>
        <FilterButton
          accessibilityLabel="Filter activity"
          activeCount={activeFilterCount}
          expanded={isFilterVisible}
          onPress={() => setIsFilterVisible(true)}
        />
      </View>

      {filtered.length === 0 ? (
        <EmptyStateCard iconName="sparkles-outline" title="No activity matches this filter" />
      ) : (
        <View style={styles.list}>
          {filtered.map((item, index) => (
            <Fragment key={item.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <ActivityRow item={item} />
            </Fragment>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 12,
    paddingBottom: 4,
  },
  count: {
    ...mobileText.label,
  },
  list: {
    gap: 10,
  },
  divider: {
    height: 1,
    backgroundColor: mobileColors.borderSubtle,
  },
});
