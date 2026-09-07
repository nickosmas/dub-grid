"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getIsoDateInTimeZone } from "@dubgrid/schedule-core";
import type { Employee, EmployeeActivityEntry } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";
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
import { getAuditCategoryOptions, PERSON_ACTIVITY_CATEGORIES } from "@/lib/audit/registry";
import { ActivityDetailsDialog } from "@/components/activity/ActivityLogParts";
import { ActivityTable } from "@/components/activity/ActivityTable";
import { ActivitySkeleton } from "@/components/activity/ActivitySkeleton";
import { ActivityPeriodStats } from "@/components/activity/ActivityPeriodStats";
import { ActivityEmptyPeriod } from "@/components/activity/ActivityEmptyPeriod";
import { PeriodNavigator } from "@/components/activity/PeriodNavigator";
import { useActivityPeriod } from "@/components/activity/useActivityPeriod";

interface ActivityTabProps {
  employee: Employee;
  entries: EmployeeActivityEntry[];
  loading: boolean;
  error: string | null;
  timeZone?: string | null;
}

export function ActivityTab({
  employee,
  entries,
  loading,
  error,
  timeZone = null,
}: ActivityTabProps) {
  const [selectedEntry, setSelectedEntry] = useState<EmployeeActivityEntry | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const categoryOptions = useMemo(
    () =>
      getAuditCategoryOptions(PERSON_ACTIVITY_CATEGORIES).map(({ value, label }) => ({
        value,
        label,
      })),
    [],
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

  const hasFilters = categoryFilter !== "all" || searchQuery.trim().length > 0;
  const visible = useMemo(
    () =>
      inPeriod.filter(
        (entry) =>
          matchesCategory(entry.action, categoryFilter) &&
          matchesActivitySearch(entry, searchQuery),
      ),
    [inPeriod, categoryFilter, searchQuery],
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

  const name = getEmployeeDisplayName(employee);

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
      <div className="dg-activity-toolbar">
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
            value={categoryFilter}
            options={categoryOptions}
            onChange={setCategoryFilter}
            ariaLabel="Filter by activity type"
            style={{ minWidth: 160 }}
            fontSize="var(--dg-fs-navigation-item)"
            fontWeight="var(--dg-type-control-weight)"
            activeFontWeight="var(--dg-type-control-weight)"
            letterSpacing="normal"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <ActivityEmptyPeriod
          periodPhrase={period.phrase}
          hasFilters={hasFilters}
          onClearFilters={() => {
            setSearchQuery("");
            setCategoryFilter("all");
          }}
          previousActivity={nearestActivity}
          description={
            entries.length === 0 && !hasFilters
              ? `Changes to ${name}'s profile, status, access, or invitations will show up here.`
              : undefined
          }
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
