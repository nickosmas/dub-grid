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
import { CoverageSectionRow } from "../../../src/features/dashboard/components/CoverageBySectionCard";
import { useExpandedDashboardQuery } from "../../../src/features/dashboard/hooks/useExpandedDashboardQuery";
import { getMobileQueryContentState } from "../../../src/shared/lib/query-state";
import { useMobileColors } from "../../../src/shared/providers/ThemeModeProvider";
import { mobileText, type MobileColors } from "../../../src/shared/theme/tokens";

export default function CoverageExpandedScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { dashboardQuery, bootstrapQuery } = useExpandedDashboardQuery();
  const [focusAreaFilter, setFocusAreaFilter] = useState<number | "all">("all");
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  const contentState = getMobileQueryContentState({
    hasData: dashboardQuery.data !== undefined,
    isLoading: dashboardQuery.isLoading || bootstrapQuery.isLoading,
    error: dashboardQuery.error ?? bootstrapQuery.error,
  });

  if (contentState.kind === "loading") {
    return (
      <Screen title="Coverage" bottomPaddingMode="tabbed">
        <View style={styles.loadingState}>
          <ListSkeleton rows={4} showSectionHeader={false} />
        </View>
      </Screen>
    );
  }

  if (contentState.kind === "error") {
    return (
      <Screen title="Coverage" bottomPaddingMode="tabbed">
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

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    loadingState: {
      gap: 14,
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
