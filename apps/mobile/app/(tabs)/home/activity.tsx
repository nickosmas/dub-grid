import { Fragment, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../../../src/shared/components/Screen";
import { StatusBanner } from "../../../src/shared/components/StatusBanner";
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
import { DashboardListSkeleton } from "../../../src/features/dashboard/components/DashboardSkeleton";
import { useExpandedDashboardQuery } from "../../../src/features/dashboard/hooks/useExpandedDashboardQuery";
import { useMobileContentState } from "../../../src/shared/hooks/useMobileContentState";
import { useMobileColors } from "../../../src/shared/providers/ThemeModeProvider";
import { mobileText, type MobileColors } from "../../../src/shared/theme/tokens";

const ACTIVITY_TYPES: ActivityType[] = ["publish", "shift_change", "request", "user_signup"];
type TypeFilter = "all" | ActivityType;

export default function ActivityExpandedScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { dashboardQuery, bootstrapQuery } = useExpandedDashboardQuery();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  const contentState = useMobileContentState({
    hasData: dashboardQuery.data !== undefined,
    isLoading: dashboardQuery.isLoading || bootstrapQuery.isLoading,
    error: dashboardQuery.error ?? bootstrapQuery.error,
  });

  if (contentState.kind === "loading") {
    return (
      <Screen bottomPaddingMode="tabbed">
        {contentState.showSkeleton ? <DashboardListSkeleton rows={4} variant="feed" /> : null}
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
          title="Could not load activity"
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

  const items = dashboardQuery.data.activity;
  const filtered = typeFilter === "all" ? items : items.filter((item) => item.type === typeFilter);
  const activeFilterCount = typeFilter === "all" ? 0 : 1;

  return (
    <Screen bottomPaddingMode="tabbed">
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
        <EmptyStateCard iconName="options-outline" title="No activity matches this filter" />
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

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
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
