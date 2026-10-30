"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CustomSelect from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";
import { StatusPill } from "@/components/ui/status-pill";
import { requestRowsInRange, type PersonRequestRow } from "@/lib/person-requests";

type Filter = "all" | "waiting" | "decided";

const SENT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

interface RequestsTabProps {
  rows: PersonRequestRow[] | undefined;
  loading: boolean;
  error: string | null;
  range: { startDate: string; endDate: string };
  /** "this pay period", "between Sep 1 and Oct 15". */
  periodPhrase: string;
}

/** Pickups, swaps, call-offs and profile change requests involving them, newest first. */
export function RequestsTab({ rows, loading, error, range, periodPhrase }: RequestsTabProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const inPeriod = useMemo(() => requestRowsInRange(rows ?? [], range), [range, rows]);
  const shown = useMemo(
    () =>
      inPeriod.filter((row) =>
        filter === "all" ? true : filter === "waiting" ? row.waiting : !row.waiting,
      ),
    [filter, inPeriod],
  );

  return (
    <section aria-label="Requests" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="dg-section-heading">Requests</h2>
          {loading || error ? null : (
            <span className="dg-tabular-nums text-[13px] text-[var(--dg-color-text-subtle)]">
              {inPeriod.length} {inPeriod.length === 1 ? "request" : "requests"} sent {periodPhrase}
            </span>
          )}
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

      {error ? (
        <p
          role="alert"
          className="m-0 rounded-[var(--dg-radius-lg)] border border-dashed border-[var(--dg-color-border)] px-5 py-8 text-center text-[13px] text-[var(--dg-color-danger)]"
        >
          {error}
        </p>
      ) : loading ? (
        <EmptyState size="compact" title="Loading requests" />
      ) : shown.length === 0 ? (
        <EmptyState
          size="compact"
          title={
            inPeriod.length === 0
              ? `No requests sent ${periodPhrase}`
              : "No requests match this filter"
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
