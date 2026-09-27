"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getIsoDateInTimeZone } from "@dubgrid/schedule-core";
import type { EmployeeActivityEntry } from "@/types";
import {
  countActors,
  formatActivityDayDate,
  groupByDay,
  matchesActivitySearch,
  matchesCategory,
  summarizeCategories,
} from "@/lib/activity-log-utils";
import CustomSelect from "@/components/CustomSelect";
import { CloseButton } from "@/components/ui/CloseButton";
import { isDateInPeriod } from "@/lib/activity-period";
import { getAuditCategoryOptions, type AuditCategory } from "@/lib/audit/registry";
import { ActivityDetailsDialog } from "@/components/activity/ActivityLogParts";
import { ActivityTable } from "@/components/activity/ActivityTable";
import { ActivitySkeleton } from "@/components/activity/ActivitySkeleton";
import { ActivityPeriodStats } from "@/components/activity/ActivityPeriodStats";
import { ActivityEmptyPeriod } from "@/components/activity/ActivityEmptyPeriod";
import { PeriodNavigator } from "@/components/activity/PeriodNavigator";
import { useActivityPeriod } from "@/components/activity/useActivityPeriod";

export interface ActivityFilterOption {
  value: string;
  label: string;
}

interface PersonActivityTimelineProps {
  entries: EmployeeActivityEntry[];
  loading: boolean;
  error: string | null;
  timeZone?: string | null;
  /** The activity types the category filter offers. */
  categories: readonly AuditCategory[];
  /** What an empty history will hold, shown before anything has happened. */
  emptyDescription: string;
  /** Adds an organization filter and column, for a history spanning organizations. */
  organizations?: ActivityFilterOption[];
}

/** One person's activity: period navigation, search, filters and the day-grouped table. */
export function PersonActivityTimeline({
  entries,
  loading,
  error,
  timeZone = null,
  categories: categoryChoices,
  emptyDescription,
  organizations,
}: PersonActivityTimelineProps) {
  const [selectedEntry, setSelectedEntry] = useState<EmployeeActivityEntry | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState("all");

  const categoryOptions = useMemo(
    () =>
      getAuditCategoryOptions(categoryChoices).map(({ value, label }) => ({
        value,
        label,
      })),
    [categoryChoices],
  );

  const dated = useMemo(
    () =>
      entries.map((entry) => ({
        entry,
        dateKey: getIsoDateInTimeZone(new Date(entry.createdAt), timeZone),
      })),
    [entries, timeZone],
  );

  // A person's history is sparse, so opening on the current month would show
  // an empty screen for most people. Start where their latest event is.
  const latestDateKey = dated.length > 0 ? dated[0].dateKey : null;

  const period = useActivityPeriod({
    timeZone,
    defaultUnit: "month",
    initialAnchorDate: latestDateKey,
  });

  const inPeriod = useMemo(
    () => dated.filter((item) => isDateInPeriod(period.period, item.dateKey)).map((i) => i.entry),
    [dated, period.period],
  );

  const hasFilters =
    categoryFilter !== "all" || organizationFilter !== "all" || searchQuery.trim().length > 0;
  const visible = useMemo(
    () =>
      inPeriod.filter(
        (entry) =>
          matchesCategory(entry.action, categoryFilter) &&
          (organizationFilter === "all" || (entry.orgId ?? "none") === organizationFilter) &&
          matchesActivitySearch(entry, searchQuery),
      ),
    [inPeriod, categoryFilter, organizationFilter, searchQuery],
  );

  const groups = useMemo(
    () => groupByDay(visible, { timeZone, todayDate: period.todayDate }),
    [visible, timeZone, period.todayDate],
  );
  const categories = useMemo(() => summarizeCategories(visible), [visible]);

  // The nearest event either side of an empty period, so it is never a dead end.
  // Stepping back before someone's first event is as easy to do as stepping
  // into a quiet month, and both need a way out.
  const nearestActivity = useMemo(() => {
    if (dated.length === 0) return null;
    const earlier = dated.find((item) => item.dateKey < period.period.startDate);
    const target = earlier ?? dated[dated.length - 1];
    const isEarlier = Boolean(earlier);
    return {
      label: `the ${isEarlier ? "previous" : "earliest"} activity, ${formatActivityDayDate(target.dateKey)}`,
      onJump: () => period.jumpTo(target.dateKey),
    };
  }, [dated, period.period.startDate]);

  if (loading) {
    return <ActivitySkeleton rows={5} />;
  }

  if (error) {
    return (
      <p
        role="alert"
        className="py-10 text-center text-[length:var(--dg-fs-body-sm)] text-[var(--dg-color-danger)]"
      >
        {error}
      </p>
    );
  }

  return (
    <div>
      <div className="dg-activity-toolbar dg-field-raised">
        <PeriodNavigator
          unit={period.unit}
          label={period.label}
          anchorDate={period.anchorDate}
          isCurrent={period.isCurrent}
          nextDisabled={period.nextDisabled}
          onUnitChange={period.setUnit}
          onPrev={period.goPrev}
          onNext={period.goNext}
          onToday={period.goToday}
          onJumpToDate={period.jumpTo}
        />

        <div className="dg-activity-toolbar-filters">
          <div className="dg-activity-search">
            <span className="dg-activity-search-icon">
              <Search size={14} />
            </span>
            <input
              type="text"
              className="dg-input"
              placeholder="Search activity"
              aria-label="Search activity"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {searchQuery && (
              <CloseButton
                size="sm"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2"
              />
            )}
          </div>
          <CustomSelect
            style={{ flex: "1 1 auto" }}
            value={categoryFilter}
            options={categoryOptions}
            onChange={setCategoryFilter}
            ariaLabel="Filter by activity type"
            fontSize="var(--dg-fs-navigation-item)"
            fontWeight="var(--dg-type-control-weight)"
            activeFontWeight="var(--dg-type-control-weight)"
            letterSpacing="normal"
          />
          {organizations ? (
            <CustomSelect
              style={{ flex: "1 1 auto" }}
              value={organizationFilter}
              options={[{ value: "all", label: "All organizations" }, ...organizations]}
              onChange={setOrganizationFilter}
              ariaLabel="Filter by organization"
              fontSize="var(--dg-fs-navigation-item)"
              fontWeight="var(--dg-type-control-weight)"
              activeFontWeight="var(--dg-type-control-weight)"
              letterSpacing="normal"
            />
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <ActivityEmptyPeriod
          periodPhrase={period.phrase}
          hasFilters={hasFilters}
          onClearFilters={() => {
            setSearchQuery("");
            setCategoryFilter("all");
            setOrganizationFilter("all");
          }}
          previousActivity={nearestActivity}
          description={entries.length === 0 && !hasFilters ? emptyDescription : undefined}
        />
      ) : (
        <>
          <ActivityPeriodStats
            total={visible.length}
            dayCount={groups.length}
            actorCount={countActors(visible)}
            categories={categories}
            periodPhrase={period.phrase}
          />

          <ActivityTable
            groups={groups}
            timeZone={timeZone}
            showTarget={false}
            showOrganization={Boolean(organizations)}
            onSelect={setSelectedEntry}
          />
        </>
      )}

      {selectedEntry ? (
        <ActivityDetailsDialog
          entry={selectedEntry}
          timeZone={timeZone}
          onClose={() => setSelectedEntry(null)}
        />
      ) : null}
    </div>
  );
}
