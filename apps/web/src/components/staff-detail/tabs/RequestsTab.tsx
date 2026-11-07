"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/Button";
import CustomSelect from "@/components/CustomSelect";
import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import { EmptyState } from "@/components/EmptyState";
import { ListRowsSkeleton } from "@/components/LoadingSkeletons";
import { StatusPill } from "@/components/ui/status-pill";
import { formatPersonPeriodLabel, monthPeriod } from "@/lib/person-period";
import {
  nearestRequestDate,
  requestRowsInRange,
  type PersonRequestRow,
} from "@/lib/person-requests";

type Filter = "all" | "waiting" | "decided";

const SENT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

interface RequestsTabProps {
  rows: PersonRequestRow[] | undefined;
  loading: boolean;
  error: string | null;
  range: { startDate: string; endDate: string };
  /** "this pay period", "between Sep 1 and Oct 15". */
  periodPhrase: string;
  /** Moves the page's period to the month holding this date. */
  onJumpToDate?: (date: string) => void;
}

/** Pickups, swaps, call-offs and profile change requests involving them, newest first. */
export function RequestsTab({
  rows,
  loading,
  error,
  range,
  periodPhrase,
  onJumpToDate,
}: RequestsTabProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const inPeriod = useMemo(() => requestRowsInRange(rows ?? [], range), [range, rows]);
  const shown = useMemo(
    () =>
      inPeriod.filter((row) =>
        filter === "all" ? true : filter === "waiting" ? row.waiting : !row.waiting,
      ),
    [filter, inPeriod],
  );

  if (error) {
    return (
      <section aria-label="Requests">
        <p
          role="alert"
          className="dg-card m-0 px-5 py-8 text-center text-[13px] text-[var(--dg-color-danger)]"
        >
          {error}
        </p>
      </section>
    );
  }
  if (loading) {
    return (
      <section aria-label="Requests">
        <ListRowsSkeleton rows={4} label="Loading requests" />
      </section>
    );
  }
  if (inPeriod.length === 0) {
    const elsewhere = nearestRequestDate(rows ?? [], range);
    return (
      <section aria-label="Requests">
        <EmptyState
          size="compact"
          title={`No requests ${periodPhrase}`}
          description={
            elsewhere
              ? undefined
              : "Pickups, swaps, call-offs and profile changes they send show up here."
          }
          action={
            elsewhere && onJumpToDate ? (
              <Button
                type="button"
                className="dg-btn dg-btn-secondary dg-btn-sm"
                onClick={() => onJumpToDate(elsewhere)}
              >
                Jump to {formatPersonPeriodLabel(monthPeriod(elsewhere))}
              </Button>
            ) : undefined
          }
        />
      </section>
    );
  }

  return (
    <section aria-label="Requests" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="dg-section-heading">Requests</h2>
          <span className="dg-tabular-nums text-[13px] text-[var(--dg-color-text-subtle)]">
            {inPeriod.length} {inPeriod.length === 1 ? "request" : "requests"} sent {periodPhrase}
          </span>
        </div>
        <CustomSelect<Filter>
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter requests"
          options={[
            { value: "all", label: "All requests" },
            { value: "waiting", label: "Waiting on you" },
            { value: "decided", label: "Decided or closed" },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState
          size="compact"
          title="No requests match this filter"
          action={
            <ClearFiltersButton activeFilterCount={1} onClear={() => setFilter("all")} small />
          }
        />
      ) : (
        <div className="dg-card overflow-hidden">
          {shown.map((row, index) => (
            <div
              key={row.key}
              className={`grid grid-cols-1 items-center gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[90px_minmax(0,1fr)_auto] ${index > 0 ? "border-t border-[var(--dg-color-border-light)]" : ""}`}
            >
              <span className="dg-tabular-nums text-[14px] text-[var(--dg-color-text-secondary)]">
                {SENT.format(new Date(`${row.sentDate}T00:00:00Z`))}
              </span>
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
                  {row.type} · {row.details}
                </span>
                <span className="text-[13px] text-[var(--dg-color-text-subtle)]">
                  {row.waiting
                    ? row.secondary
                    : [
                        row.secondary,
                        row.decidedBy ? `${row.state} by ${row.decidedBy}` : row.state,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </span>
              </span>
              {row.waiting ? (
                <span className="flex items-center gap-2">
                  <StatusPill tone="warning">Waiting on you</StatusPill>
                  <Link href={row.reviewHref} className="dg-btn dg-btn-secondary dg-btn-sm">
                    Review
                  </Link>
                </span>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
