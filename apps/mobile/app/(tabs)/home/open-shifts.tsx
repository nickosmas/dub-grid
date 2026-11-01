import { capitalizeFirst, pluralLabelNoun, singularLabelNoun } from "@dubgrid/domain";
import { useMemo, useState } from "react";
import { Screen } from "../../../src/shared/components/Screen";
import { StatusBanner } from "../../../src/shared/components/StatusBanner";
import { EmptyStateCard } from "../../../src/shared/components/EmptyStateCard";
import {
  FilterSheet,
  SelectionRow,
  SelectionSection,
} from "../../../src/shared/components/FilterSheet";
import {
  getOpenShiftsEmptyCopy,
  OpenShiftRow,
} from "../../../src/features/dashboard/components/OpenShiftsCard";
import { DashboardListSkeleton } from "../../../src/features/dashboard/components/DashboardSkeleton";
import { DashboardRowList } from "../../../src/features/dashboard/components/DashboardRowList";
import { DashboardListSection } from "../../../src/features/dashboard/components/DashboardListSection";
import { HeaderFilterAction } from "../../../src/shared/navigation/HeaderFilterAction";
import { useExpandedDashboardQuery } from "../../../src/features/dashboard/hooks/useExpandedDashboardQuery";
import { useManualRefresh } from "../../../src/shared/hooks/useManualRefresh";
import { useMobileContentState } from "../../../src/shared/hooks/useMobileContentState";

const URGENCY_OPTIONS = ["all", "high", "medium", "low"] as const;
type UrgencyFilter = (typeof URGENCY_OPTIONS)[number];
const UNASSIGNED_LABEL = "Unassigned";

export default function OpenShiftsExpandedScreen() {
  const { dashboardQuery, bootstrapQuery } = useExpandedDashboardQuery();
  const focusAreaLabel = bootstrapQuery.data?.currentOrg?.labels?.focusArea ?? "Focus Areas";
  // Drilling in from Home used to lose pull-to-refresh entirely: these routes
  // share Home's cached query, so the only way to refresh was to back out.
  const manualRefresh = useManualRefresh(() => dashboardQuery.refetch());
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("all");
  const [focusAreaFilter, setFocusAreaFilter] = useState<string>("all");
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  const openShifts = dashboardQuery.data?.openShifts ?? [];
  const focusAreaNames = useMemo(
    () => [...new Set(openShifts.map((shift) => shift.focusAreaName ?? UNASSIGNED_LABEL))].sort(),
    [openShifts],
  );
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
        {contentState.showSkeleton ? <DashboardListSkeleton variant="figure" /> : null}
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
          title="Couldn't load open shifts"
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

  const filtered = openShifts.filter((shift) => {
    if (urgencyFilter !== "all" && shift.urgency !== urgencyFilter) return false;
    if (
      focusAreaFilter !== "all" &&
      (shift.focusAreaName ?? UNASSIGNED_LABEL) !== focusAreaFilter
    ) {
      return false;
    }
    return true;
  });
  const activeFilterCount = (urgencyFilter !== "all" ? 1 : 0) + (focusAreaFilter !== "all" ? 1 : 0);

  return (
    <Screen
      bottomPaddingMode="tabbed"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
    >
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
              label={
                option === "all" ? "All urgency" : option.charAt(0).toUpperCase() + option.slice(1)
              }
              onPress={() => setUrgencyFilter(option)}
              selected={urgencyFilter === option}
            />
          ))}
        </SelectionSection>

        <SelectionSection label={capitalizeFirst(singularLabelNoun(focusAreaLabel))}>
          <SelectionRow
            label={`All ${pluralLabelNoun(focusAreaLabel)}`}
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

      <HeaderFilterAction
        accessibilityLabel="Filter open shifts"
        activeCount={activeFilterCount}
        onPress={() => setIsFilterVisible(true)}
      />

      {filtered.length === 0 ? (
        activeFilterCount > 0 ? (
          <EmptyStateCard iconName="checkmark-circle" title="No open shifts match this filter" />
        ) : (
          <EmptyStateCard
            {...getOpenShiftsEmptyCopy(dashboardQuery.data?.metrics.coverageWindow)}
            iconName="checkmark-circle"
          />
        )
      ) : (
        <DashboardListSection
          caption={`${filtered.length} ${filtered.length === 1 ? "shift" : "shifts"}`}
        >
          <DashboardRowList
            items={filtered}
            keyExtractor={(shift) => shift.id}
            renderItem={(shift) => <OpenShiftRow shift={shift} />}
          />
        </DashboardListSection>
      )}
    </Screen>
  );
}
