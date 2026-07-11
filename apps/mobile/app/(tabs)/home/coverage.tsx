import { useState } from "react";
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
import { CoverageSectionRow } from "../../../src/features/dashboard/components/CoverageBySectionCard";
import { useExpandedDashboardQuery } from "../../../src/features/dashboard/hooks/useExpandedDashboardQuery";
import { mobileText } from "../../../src/shared/theme/tokens";

export default function CoverageExpandedScreen() {
  const { dashboardQuery, bootstrapQuery } = useExpandedDashboardQuery();
  const [focusAreaFilter, setFocusAreaFilter] = useState<number | "all">("all");
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  if (dashboardQuery.isLoading || bootstrapQuery.isLoading) {
    return (
      <LoadingScreen title="Loading coverage" body="Getting the latest for your organization." />
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <Screen title="Coverage" bottomPaddingMode="tabbed">
        <QueryStateCard
          title="Couldn't load coverage"
          body="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            void dashboardQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  const sections = dashboardQuery.data.coverageBySection;
  const focusAreaLabel = bootstrapQuery.data?.currentOrg.labels?.focusArea ?? "Wings";
  const filtered =
    focusAreaFilter === "all"
      ? sections
      : sections.filter((section) => section.focusAreaId === focusAreaFilter);
  const activeFilterCount = focusAreaFilter === "all" ? 0 : 1;

  return (
    <Screen title="Coverage" bottomPaddingMode="tabbed">
      <FilterSheet
        clearDisabled={activeFilterCount === 0}
        title={`Filter by ${focusAreaLabel.toLowerCase()}`}
        onClearAll={() => setFocusAreaFilter("all")}
        onDismiss={() => setIsFilterVisible(false)}
        onDone={() => setIsFilterVisible(false)}
        visible={isFilterVisible}
      >
        <SelectionSection label={focusAreaLabel}>
          <SelectionRow
            label={`All ${focusAreaLabel.toLowerCase()}`}
            onPress={() => setFocusAreaFilter("all")}
            selected={focusAreaFilter === "all"}
          />
          {sections.map((section) => (
            <SelectionRow
              key={section.focusAreaId}
              label={section.focusAreaName}
              onPress={() => setFocusAreaFilter(section.focusAreaId)}
              selected={focusAreaFilter === section.focusAreaId}
            />
          ))}
        </SelectionSection>
      </FilterSheet>

      <View style={styles.headerRow}>
        <Text style={styles.count}>
          {filtered.length} {filtered.length === 1 ? "section" : "sections"}
        </Text>
        <FilterButton
          accessibilityLabel="Filter coverage"
          activeCount={activeFilterCount}
          expanded={isFilterVisible}
          onPress={() => setIsFilterVisible(true)}
        />
      </View>

      {filtered.length === 0 ? (
        <EmptyStateCard
          iconName="stats-chart-outline"
          title="No coverage to track yet"
          body="Coverage appears here once staffing requirements are configured and the period is published."
        />
      ) : (
        <View style={styles.list}>
          {filtered.map((section) => (
            <CoverageSectionRow key={section.focusAreaId} section={section} />
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
