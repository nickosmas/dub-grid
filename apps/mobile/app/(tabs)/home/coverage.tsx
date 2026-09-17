import { useMemo, useState } from "react";
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
import { CoverageSectionRow } from "../../../src/features/dashboard/components/CoverageBySectionCard";
import { DashboardListSkeleton } from "../../../src/features/dashboard/components/DashboardSkeleton";
import { DashboardRowList } from "../../../src/features/dashboard/components/DashboardRowList";
import { useExpandedDashboardQuery } from "../../../src/features/dashboard/hooks/useExpandedDashboardQuery";
import { useManualRefresh } from "../../../src/shared/hooks/useManualRefresh";
import { useMobileContentState } from "../../../src/shared/hooks/useMobileContentState";
import { useMobileColors } from "../../../src/shared/providers/ThemeModeProvider";
import { mobileText, type MobileColors } from "../../../src/shared/theme/tokens";

export default function CoverageExpandedScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { dashboardQuery, bootstrapQuery } = useExpandedDashboardQuery();
  // Drilling in from Home used to lose pull-to-refresh entirely: these routes
  // share Home's cached query, so the only way to refresh was to back out.
  const manualRefresh = useManualRefresh(() => dashboardQuery.refetch());
  const [focusAreaFilter, setFocusAreaFilter] = useState<number | "all">("all");
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  const contentState = useMobileContentState({
    hasData: dashboardQuery.data !== undefined,
    isLoading: dashboardQuery.isLoading || bootstrapQuery.isLoading,
    error: dashboardQuery.error ?? bootstrapQuery.error,
  });

  if (contentState.kind === "loading") {
    return (
      // A skeleton stands in for content; it must not scroll, and there is
      // nothing to pull-to-refresh while the thing is still loading.
      <Screen bottomPaddingMode="tabbed" scrollEnabled={false}>
        {contentState.showSkeleton ? <DashboardListSkeleton rows={4} variant="meter" /> : null}
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
          title="Could not load coverage"
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

  const sections = dashboardQuery.data.coverageBySection;
  const focusAreaLabel = bootstrapQuery.data?.currentOrg.labels?.focusArea ?? "Wings";
  const filtered =
    focusAreaFilter === "all"
      ? sections
      : sections.filter((section) => section.focusAreaId === focusAreaFilter);
  const activeFilterCount = focusAreaFilter === "all" ? 0 : 1;

  return (
    <Screen
      bottomPaddingMode="tabbed"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
    >
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
          body="Coverage appears here once staffing requirements are configured and the period is published."
          iconName="stats-chart-outline"
          title="No coverage to track yet"
        />
      ) : (
        <DashboardRowList
          items={filtered}
          keyExtractor={(section) => String(section.focusAreaId)}
          renderItem={(section) => <CoverageSectionRow section={section} />}
        />
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
  });
