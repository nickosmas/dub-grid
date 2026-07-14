import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../../../src/shared/components/Screen";
import { ListSkeleton } from "../../../src/shared/components/Skeleton";
import { StatusBanner } from "../../../src/shared/components/StatusBanner";
import { EmptyStateCard } from "../../../src/shared/components/EmptyStateCard";
import {
  FilterButton,
  FilterSheet,
  SelectionRow,
  SelectionSection,
} from "../../../src/shared/components/FilterSheet";
import { StaffHoursRow } from "../../../src/features/dashboard/components/StaffHoursCard";
import { useExpandedDashboardQuery } from "../../../src/features/dashboard/hooks/useExpandedDashboardQuery";
import { getMobileQueryContentState } from "../../../src/shared/lib/query-state";
import { mobileColors, mobileText } from "../../../src/shared/theme/tokens";

type SortMode = "overtime" | "alphabetical";
const UNASSIGNED_LABEL = "Unassigned";

export default function StaffHoursExpandedScreen() {
  const { dashboardQuery, bootstrapQuery } = useExpandedDashboardQuery();
  const [sortMode, setSortMode] = useState<SortMode>("overtime");
  const [focusAreaFilter, setFocusAreaFilter] = useState<string>("all");
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  const entries = dashboardQuery.data?.staffHours ?? [];
  const focusAreaNames = useMemo(
    () => [...new Set(entries.map((entry) => entry.focusAreaName ?? UNASSIGNED_LABEL))].sort(),
    [entries],
  );
  const contentState = getMobileQueryContentState({
    hasData: dashboardQuery.data !== undefined,
    isLoading: dashboardQuery.isLoading || bootstrapQuery.isLoading,
    error: dashboardQuery.error ?? bootstrapQuery.error,
  });

  if (contentState.kind === "loading") {
    return (
      <Screen title="Overtime watch" bottomPaddingMode="tabbed">
        <View style={styles.loadingState}>
          <Text style={styles.loadingTitle}>Loading overtime watch</Text>
          <ListSkeleton rows={4} showSectionHeader={false} />
        </View>
      </Screen>
    );
  }

  if (contentState.kind === "error") {
    return (
      <Screen title="Overtime watch" bottomPaddingMode="tabbed">
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load overtime watch"
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

  const filtered = entries.filter(
    (entry) => focusAreaFilter === "all" || (entry.focusAreaName ?? UNASSIGNED_LABEL) === focusAreaFilter,
  );
  const sorted =
    sortMode === "alphabetical"
      ? [...filtered].sort((a, b) => a.employeeName.localeCompare(b.employeeName))
      : [...filtered].sort((a, b) => b.overtimeHours - a.overtimeHours);
  const activeFilterCount =
    (sortMode === "alphabetical" ? 1 : 0) + (focusAreaFilter !== "all" ? 1 : 0);

  return (
    <Screen title="Overtime watch" bottomPaddingMode="tabbed">
      <FilterSheet
        clearDisabled={activeFilterCount === 0}
        title="Filter overtime watch"
        onClearAll={() => {
          setSortMode("overtime");
          setFocusAreaFilter("all");
        }}
        onDismiss={() => setIsFilterVisible(false)}
        onDone={() => setIsFilterVisible(false)}
        visible={isFilterVisible}
      >
        <SelectionSection label="Sort by">
          <SelectionRow
            label="Most overtime"
            onPress={() => setSortMode("overtime")}
            selected={sortMode === "overtime"}
          />
          <SelectionRow
            label="Alphabetical"
            onPress={() => setSortMode("alphabetical")}
            selected={sortMode === "alphabetical"}
          />
        </SelectionSection>

        <SelectionSection label="Focus area">
          <SelectionRow
            label="All focus areas"
            onPress={() => setFocusAreaFilter("all")}
            selected={focusAreaFilter === "all"}
          />
          {focusAreaNames.map((name) => (
            <SelectionRow
              key={name}
              label={name}
              onPress={() => setFocusAreaFilter(name)}
              selected={focusAreaFilter === name}
            />
          ))}
        </SelectionSection>
      </FilterSheet>

      <View style={styles.headerRow}>
        <Text style={styles.count}>
          {sorted.length} {sorted.length === 1 ? "person" : "people"}
        </Text>
        <FilterButton
          accessibilityLabel="Filter overtime watch"
          activeCount={activeFilterCount}
          expanded={isFilterVisible}
          onPress={() => setIsFilterVisible(true)}
        />
      </View>

      {sorted.length === 0 ? (
        <EmptyStateCard
          iconName="checkmark-circle-outline"
          title={`No one is over ${dashboardQuery.data.overtimeThresholdHours}h this period`}
        />
      ) : (
        <View style={styles.list}>
          {sorted.map((entry) => (
            <StaffHoursRow key={entry.employeeId} entry={entry} />
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
    gap: 16,
  },
});
