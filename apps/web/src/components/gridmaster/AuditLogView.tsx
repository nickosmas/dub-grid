"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchAuditLogDayCounts, fetchGridmasterFullAuditLog } from "@/features/gridmaster/client";
import { Pagination } from "@/components/ui/pagination";
import { countActors, groupByDay, summarizeCategories } from "@/lib/activity-log-utils";
import { formatActivityPeriodPhrase, shiftActivityPeriod } from "@/lib/activity-period";
import {
  AUDIT_CATEGORY_OPTIONS,
  AUDIT_RESOURCE_TYPE_OPTIONS,
  getAuditCategoryOptions,
  ORG_ACTIVITY_CATEGORIES,
} from "@/lib/audit/registry";
import CustomSelect from "@/components/CustomSelect";
import { queryKeys } from "@/lib/query-keys";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { ActivityDetailsDialog } from "@/components/activity/ActivityLogParts";
import { ActivityTable } from "@/components/activity/ActivityTable";
import { ActivitySkeleton } from "@/components/activity/ActivitySkeleton";
import { ActivityPeriodStats } from "@/components/activity/ActivityPeriodStats";
import { ActivityEmptyPeriod } from "@/components/activity/ActivityEmptyPeriod";
import { PeriodNavigator } from "@/components/activity/PeriodNavigator";
import { useActivityPeriod } from "@/components/activity/useActivityPeriod";
import type { FullAuditLogEntry } from "@/types";

const PAGE_SIZE = 100;

export default function AuditLogView({
  orgId,
  title,
  initialActionFilter = "all",
  timeZone = null,
}: {
  orgId?: string;
  title?: string;
  initialActionFilter?: string;
  /** The organization's zone. Absent for the platform-wide log, which is UTC. */
  timeZone?: string | null;
}) {
  const period = useActivityPeriod({ timeZone });

  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState(initialActionFilter);
  const [resourceType, setResourceType] = useState("");
  const [target, setTarget] = useState("");
  const [highRiskOnly, setHighRiskOnly] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<FullAuditLogEntry | null>(null);

  // Scoped to one organization, platform rows cannot appear at all.
  const categoryOptions = useMemo(
    () => (orgId ? getAuditCategoryOptions(ORG_ACTIVITY_CATEGORIES) : AUDIT_CATEGORY_OPTIONS),
    [orgId],
  );

  const trimmedTarget = target.trim();
  const hasFilters =
    actionFilter !== "all" || resourceType !== "" || trimmedTarget !== "" || highRiskOnly;

  const requestFilters = {
    orgId,
    actionPrefixes:
      categoryOptions.find((option) => option.value === actionFilter)?.prefixes ?? undefined,
    resourceType: resourceType || undefined,
    target: trimmedTarget || undefined,
    highRiskOnly,
  };

  const filterKey = JSON.stringify({
    actionFilter,
    resourceType,
    target: trimmedTarget,
    highRiskOnly,
    startAt: period.startAt,
    endAt: period.endAt,
  });

  const auditQuery = useQuery({
    queryKey: queryKeys.gridmaster.orgAudit(orgId ?? null, page, PAGE_SIZE, filterKey),
    queryFn: () =>
      fetchGridmasterFullAuditLog({
        ...requestFilters,
        startDate: period.startAt,
        endDate: period.endAt,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const entries = useMemo(() => auditQuery.data ?? [], [auditQuery.data]);
  const isEmpty = !auditQuery.isPending && entries.length === 0;

  const previousQuery = useQuery({
    queryKey: queryKeys.gridmaster.orgAudit(orgId ?? null, -1, 1, `before:${filterKey}`),
    queryFn: () =>
      fetchGridmasterFullAuditLog({
        ...requestFilters,
        endDate: new Date(Date.parse(period.startAt) - 1).toISOString(),
        limit: 1,
      }),
    enabled: isEmpty && page === 0,
  });

  // The high-risk filter and free-text search live in the rows query's joins,
  // so the count endpoint can only be trusted without them.
  const countsEnabled = trimmedTarget.length === 0 && !highRiskOnly;
  const countsQuery = useQuery({
    queryKey: queryKeys.gridmaster.orgAudit(orgId ?? null, -2, 0, `counts:${filterKey}`),
    queryFn: () =>
      fetchAuditLogDayCounts({
        orgId,
        startDate: period.startAt,
        endDate: period.endAt,
        timeZone,
        actionPrefixes: requestFilters.actionPrefixes,
        resourceType: requestFilters.resourceType,
      }),
    enabled: countsEnabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const periodCounts = countsEnabled ? (countsQuery.data ?? null) : null;

  const groups = useMemo(
    () => groupByDay(entries, { timeZone, todayDate: period.todayDate }),
    [entries, timeZone, period.todayDate],
  );
  const categories = useMemo(() => summarizeCategories(entries), [entries]);

  const error = auditQuery.error
    ? formatClientErrorMessage(auditQuery.error, "We couldn't load the audit log right now.")
    : null;

  const goTo = (move: () => void) => () => {
    move();
    setPage(0);
  };

  const resetPage = <T,>(apply: (value: T) => void) => {
    return (value: T) => {
      apply(value);
      setPage(0);
    };
  };

  const previousActivity = useMemo(() => {
    const entry = previousQuery.data?.[0];
    if (!entry) return null;
    const dateKey = entry.createdAt.slice(0, 10);
    return {
      label: `the latest activity, ${dateKey}`,
      onJump: () => {
        period.jumpTo(dateKey);
        setPage(0);
      },
    };
  }, [previousQuery.data]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="dg-type-page-title m-0">{title ?? "Audit log"}</h2>
      </div>

      <div className="dg-activity-toolbar">
        <PeriodNavigator
          unit={period.unit}
          label={period.label}
          anchorDate={period.anchorDate}
          isCurrent={period.isCurrent}
          nextDisabled={period.nextDisabled}
          onUnitChange={resetPage(period.setUnit)}
          onPrev={goTo(period.goPrev)}
          onNext={goTo(period.goNext)}
          onToday={goTo(period.goToday)}
          onJumpToDate={resetPage(period.jumpTo)}
          timeZoneNote={timeZone ? null : "Times shown in UTC"}
        />

        <div className="dg-activity-toolbar-filters">
          <CustomSelect
            value={actionFilter}
            options={categoryOptions.map(({ value, label }) => ({ value, label }))}
            onChange={resetPage(setActionFilter)}
            ariaLabel="Filter by activity type"
            style={{ flex: "1 1 auto" }}
            fontSize={12}
          />
          <CustomSelect
            value={resourceType}
            options={AUDIT_RESOURCE_TYPE_OPTIONS}
            onChange={resetPage(setResourceType)}
            ariaLabel="Item type"
            style={{ flex: "1 1 auto" }}
            fontSize={12}
          />
          <input
            className="dg-input"
            value={target}
            onChange={(event) => {
              setTarget(event.target.value);
              setPage(0);
            }}
            placeholder="Search people or details"
            aria-label="Search people or details"
            style={{ width: 190, fontSize: "var(--dg-fs-caption)" }}
          />
          <label className="inline-flex items-center gap-1.5 text-[length:var(--dg-fs-caption)] font-semibold text-[var(--dg-color-text-muted)]">
            <input
              type="checkbox"
              checked={highRiskOnly}
              onChange={(event) => {
                setHighRiskOnly(event.target.checked);
                setPage(0);
              }}
            />
            High risk
          </label>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-[var(--dg-radius-lg)] bg-[var(--dg-color-danger-bg)] px-4 py-3 text-[length:var(--dg-fs-label)] font-semibold text-[var(--dg-color-danger)]"
        >
          {error}
        </p>
      ) : auditQuery.isPending ? (
        <ActivitySkeleton rows={8} />
      ) : entries.length === 0 ? (
        <ActivityEmptyPeriod
          periodPhrase={period.phrase}
          hasFilters={hasFilters}
          onClearFilters={() => {
            setActionFilter("all");
            setResourceType("");
            setTarget("");
            setHighRiskOnly(false);
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
            showOrganization={!orgId}
            dayCounts={periodCounts?.counts}
            onSelect={setSelectedEntry}
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
          showOrganization
          onClose={() => setSelectedEntry(null)}
        />
      ) : null}
    </>
  );
}
