"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { formatDate, getIsoDateInTimeZone } from "@dubgrid/schedule-core";
import { fetchAuditLogDayCounts, fetchGridmasterFullAuditLog } from "@/features/gridmaster/client";
import type { FullAuditLogEntry } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import { CloseButton } from "@/components/ui/CloseButton";
import { Pagination } from "@/components/ui/pagination";
import { queryKeys } from "@/lib/query-keys";
import { countActors, groupByDay, summarizeCategories } from "@/lib/activity-log-utils";
import { getAuditCategoryOptions, ORG_AUDIENCE_CATEGORIES } from "@/lib/audit/registry";
import { formatActivityPeriodPhrase, shiftActivityPeriod } from "@/lib/activity-period";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { ActivityDetailsDialog } from "@/components/activity/ActivityLogParts";
import { ActivityTable } from "@/components/activity/ActivityTable";
import { ActivitySkeleton } from "@/components/activity/ActivitySkeleton";
import { ActivityPeriodStats } from "@/components/activity/ActivityPeriodStats";
import { ActivityEmptyPeriod } from "@/components/activity/ActivityEmptyPeriod";
import { PeriodNavigator } from "@/components/activity/PeriodNavigator";
import { useUrlActivityPeriod } from "@/components/activity/useActivityPeriod";

export { ActivityDetailsDialog };

const PAGE_SIZE = 200;

export default function ActivityLog({
  orgId,
  timeZone = null,
}: {
  orgId: string;
  timeZone?: string | null;
}) {
  const period = useUrlActivityPeriod({ timeZone });

  const [page, setPage] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<FullAuditLogEntry | null>(null);

  const categoryOptions = useMemo(() => getAuditCategoryOptions(ORG_AUDIENCE_CATEGORIES), []);
  const categoryPrefixes = useMemo(
    () => categoryOptions.find((category) => category.value === categoryFilter)?.prefixes ?? [],
    [categoryOptions, categoryFilter],
  );
  const search = searchQuery.trim();
  const hasFilters = categoryFilter !== "all" || search.length > 0;
  const filterKey = JSON.stringify({ categoryFilter, search });

  const requestFilters = {
    orgId,
    actionPrefixes: categoryPrefixes.length > 0 ? categoryPrefixes : undefined,
    target: search || undefined,
  };

  const activityQuery = useQuery({
    queryKey: queryKeys.org.auditLogRange(orgId, period.startAt, period.endAt, page, filterKey),
    queryFn: () =>
      fetchGridmasterFullAuditLog({
        ...requestFilters,
        startDate: period.startAt,
        endDate: period.endAt,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const entries = useMemo(() => activityQuery.data ?? [], [activityQuery.data]);
  const isEmpty = !activityQuery.isPending && entries.length === 0;

  // Only asked for when the period came back empty, so the reader gets a way
  // back to real activity instead of stepping blindly.
  const previousQuery = useQuery({
    queryKey: queryKeys.org.auditLogLatestBefore(orgId, period.startAt, filterKey),
    queryFn: () =>
      fetchGridmasterFullAuditLog({
        ...requestFilters,
        endDate: new Date(Date.parse(period.startAt) - 1).toISOString(),
        limit: 1,
      }),
    enabled: isEmpty && page === 0,
  });

  // Day headings and the period totals should describe the period, not the page
  // that happened to load. The count endpoint cannot apply the free-text
  // search, so a searching reader keeps counting their own rows.
  const countsQuery = useQuery({
    queryKey: [
      ...queryKeys.org.auditLog(orgId),
      "dayCounts",
      period.startAt,
      period.endAt,
      categoryFilter,
    ],
    queryFn: () =>
      fetchAuditLogDayCounts({
        orgId,
        startDate: period.startAt,
        endDate: period.endAt,
        timeZone,
        actionPrefixes: categoryPrefixes.length > 0 ? categoryPrefixes : undefined,
      }),
    enabled: search.length === 0,
    placeholderData: keepPreviousData,
  });
  const periodCounts = search.length === 0 ? (countsQuery.data ?? null) : null;

  const groups = useMemo(
    () => groupByDay(entries, { timeZone, todayDate: period.todayDate }),
    [entries, timeZone, period.todayDate],
  );
  const categories = useMemo(() => summarizeCategories(entries), [entries]);

  const resetPage = <T,>(apply: (value: T) => void) => {
    return (value: T) => {
      apply(value);
      setPage(0);
    };
  };

  const error = activityQuery.error
    ? formatClientErrorMessage(activityQuery.error, "We couldn't load activity right now.")
    : null;

  const previousActivity = useMemo(() => {
    const entry = previousQuery.data?.[0];
    if (!entry) return null;
    const dateKey = getIsoDateInTimeZone(new Date(entry.createdAt), timeZone);
    return {
      label: `the latest activity, ${formatDate(dateKey, { month: "short", day: "numeric", year: "numeric" })}`,
      onJump: () => {
        period.jumpTo(dateKey);
        setPage(0);
      },
    };
  }, [previousQuery.data, timeZone]);

  return (
    <div>
      <div className="dg-activity-toolbar">
        <PeriodNavigator
          unit={period.unit}
          label={period.label}
          anchorDate={period.anchorDate}
          isCurrent={period.isCurrent}
          nextDisabled={period.nextDisabled}
          onUnitChange={resetPage(period.setUnit)}
          onPrev={() => {
            period.goPrev();
            setPage(0);
          }}
          onNext={() => {
            period.goNext();
            setPage(0);
          }}
          onToday={() => {
            period.goToday();
            setPage(0);
          }}
          onJumpToDate={resetPage(period.jumpTo)}
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
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(0);
              }}
            />
            {searchQuery && (
              <CloseButton
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setPage(0);
                }}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2"
              />
            )}
          </div>
          <CustomSelect
            value={categoryFilter}
            options={categoryOptions.map(({ value, label }) => ({ value, label }))}
            onChange={resetPage(setCategoryFilter)}
            ariaLabel="Filter by activity type"
            style={{ minWidth: 160 }}
            fontSize="var(--dg-fs-navigation-item)"
            fontWeight="var(--dg-type-control-weight)"
            activeFontWeight="var(--dg-type-control-weight)"
            letterSpacing="normal"
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="py-10 text-center text-[var(--dg-color-danger)]">
          {error}
        </p>
      ) : activityQuery.isPending ? (
        <ActivitySkeleton />
      ) : entries.length === 0 ? (
        <ActivityEmptyPeriod
          periodPhrase={period.phrase}
          hasFilters={hasFilters}
          onClearFilters={() => {
            setSearchQuery("");
            setCategoryFilter("all");
            setPage(0);
          }}
          previousActivity={previousActivity}
        />
      ) : (
        <>
          <ActivityPeriodStats
            total={periodCounts?.total ?? entries.length}
            dayCount={periodCounts ? Object.keys(periodCounts.counts).length : groups.length}
            actorCount={countActors(entries)}
            categories={categories}
            periodPhrase={period.phrase}
            truncated={!periodCounts && entries.length >= PAGE_SIZE}
            pageSize={PAGE_SIZE}
          />

          <ActivityTable
            groups={groups}
            timeZone={timeZone}
            dayCounts={periodCounts?.counts}
            onSelect={(entry) => setSelectedEntry(entry as FullAuditLogEntry)}
          />

          {(page > 0 || entries.length >= PAGE_SIZE) && (
            <Pagination
              className="mt-4"
              page={page + 1}
              hasNext={entries.length >= PAGE_SIZE}
              onPageChange={(next) => setPage(next - 1)}
              summary={`Showing ${page * PAGE_SIZE + 1} to ${page * PAGE_SIZE + entries.length}`}
            />
          )}
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
