import { useMemo, useState } from "react";
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
import { OpenShiftRow } from "../../../src/features/dashboard/components/OpenShiftsCard";
import { useExpandedDashboardQuery } from "../../../src/features/dashboard/hooks/useExpandedDashboardQuery";
import { mobileText } from "../../../src/shared/theme/tokens";

const URGENCY_OPTIONS = ["all", "high", "medium", "low"] as const;
type UrgencyFilter = (typeof URGENCY_OPTIONS)[number];
const UNASSIGNED_LABEL = "Unassigned";

export default function OpenShiftsExpandedScreen() {
  const { dashboardQuery, bootstrapQuery } = useExpandedDashboardQuery();
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("all");
  const [focusAreaFilter, setFocusAreaFilter] = useState<string>("all");
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  const openShifts = dashboardQuery.data?.openShifts ?? [];
  const focusAreaNames = useMemo(
    () => [...new Set(openShifts.map((shift) => shift.focusAreaName ?? UNASSIGNED_LABEL))].sort(),
    [openShifts],
  );

  if (dashboardQuery.isLoading || bootstrapQuery.isLoading) {
    return (
      <LoadingScreen title="Loading open shifts" body="Getting the latest for your organization." />
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <Screen title="Open shifts" bottomPaddingMode="tabbed">
        <QueryStateCard
          title="Couldn't load open shifts"
          body="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            void dashboardQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  const filtered = openShifts.filter((shift) => {
    if (urgencyFilter !== "all" && shift.urgency !== urgencyFilter) return false;
    if (focusAreaFilter !== "all" && (shift.focusAreaName ?? UNASSIGNED_LABEL) !== focusAreaFilter) {
      return false;
    }
    return true;
  });
  const activeFilterCount =
    (urgencyFilter !== "all" ? 1 : 0) + (focusAreaFilter !== "all" ? 1 : 0);

  return (
    <Screen title="Open shifts" bottomPaddingMode="tabbed">
      <FilterSheet
        clearDisabled={activeFilterCount === 0}
        title="Filter open shifts"
        onClearAll={() => {
          setUrgencyFilter("all");
          setFocusAreaFilter("all");
        }}
        onDismiss={() => setIsFilterVisible(false)}
        onDone={() => setIsFilterVisible(false)}
        visible={isFilterVisible}
      >
        <SelectionSection label="Urgency">
          {URGENCY_OPTIONS.map((option) => (
            <SelectionRow
              key={option}
              label={option === "all" ? "All urgency" : option.charAt(0).toUpperCase() + option.slice(1)}
              onPress={() => setUrgencyFilter(option)}
              selected={urgencyFilter === option}
            />
          ))}
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
          {filtered.length} {filtered.length === 1 ? "shift" : "shifts"}
        </Text>
        <FilterButton
          accessibilityLabel="Filter open shifts"
          activeCount={activeFilterCount}
          expanded={isFilterVisible}
          onPress={() => setIsFilterVisible(true)}
        />
      </View>

      {filtered.length === 0 ? (
        <EmptyStateCard iconName="checkmark-circle-outline" title="No open shifts match this filter" />
      ) : (
        <View style={styles.list}>
          {filtered.map((shift) => (
            <OpenShiftRow key={shift.id} shift={shift} />
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
    gap: 16,
  },
});
