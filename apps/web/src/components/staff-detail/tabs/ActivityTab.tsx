"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Employee, EmployeeActivityEntry } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";
import { PERSON_ACTIVITY_CATEGORIES } from "@/lib/audit/registry";
import { requestRowsInRange, type PersonRequestRow } from "@/lib/person-requests";
import { PersonActivityTimeline } from "@/components/activity/PersonActivityTimeline";
import { SpanTabs } from "@/components/ui/span-tabs";
import { StatusPill } from "@/components/ui/status-pill";

type Filter = "all" | "requests" | "changes";

const SENT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

interface ActivityTabProps {
  employee: Employee;
  /** The staff page's period, which both lists follow. */
  range: { startDate: string; endDate: string; phrase: string };
  timeZone?: string | null;
  /** Null when this viewer can't review their requests. */
  requests: { rows: PersonRequestRow[] | undefined; loading: boolean; error: string | null } | null;
  /** Null when this viewer can't read the change log. */
  changes: { entries: EmployeeActivityEntry[]; loading: boolean; error: string | null } | null;
}

/** Their requests and the change log for the period, together or one at a time. */
export function ActivityTab({
  employee,
  range,
  timeZone = null,
  requests,
  changes,
}: ActivityTabProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const both = Boolean(requests && changes);
  const shown: Filter = both ? filter : requests ? "requests" : "changes";

  return (
    <div className="flex flex-col gap-4">
      {both ? (
        <SpanTabs<Filter>
          aria-label="Show"
          className="w-max"
          items={[
            { value: "all", label: "All" },
            { value: "requests", label: "Requests" },
            { value: "changes", label: "Changes" },
          ]}
          value={filter}
          onChange={setFilter}
        />
      ) : null}

      {requests && shown !== "changes" ? <RequestList {...requests} range={range} /> : null}

      {changes && shown !== "requests" ? (
        <section aria-label="Changes">
          {shown === "all" ? (
            <h2 className="m-0 mb-3 mt-4 text-[17px] font-semibold tracking-tight text-[var(--dg-color-text-primary)]">
              Changes
            </h2>
          ) : null}
          <PersonActivityTimeline
            entries={changes.entries}
            loading={changes.loading}
            error={changes.error}
            timeZone={timeZone}
            range={range}
            categories={PERSON_ACTIVITY_CATEGORIES}
            emptyDescription={`Changes to ${getEmployeeDisplayName(employee)}'s profile, status, access, or invitations will show up here.`}
          />
        </section>
      ) : null}
    </div>
  );
}

function RequestList({
  rows,
  loading,
  error,
  range,
}: NonNullable<ActivityTabProps["requests"]> & { range: ActivityTabProps["range"] }) {
  const inPeriod = useMemo(() => requestRowsInRange(rows ?? [], range), [range, rows]);

  return (
    <section aria-label="Requests">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <h2 className="m-0 text-[17px] font-semibold tracking-tight text-[var(--dg-color-text-primary)]">
          Requests
        </h2>
        {loading || error ? null : (
          <span className="dg-tabular-nums text-[13px] text-[var(--dg-color-text-subtle)]">
            {inPeriod.length} {inPeriod.length === 1 ? "request" : "requests"} sent {range.phrase}
          </span>
        )}
      </div>
      <div className="dg-card overflow-hidden">
        {error ? (
          <p
            role="alert"
            className="m-0 px-5 py-8 text-center text-[13px] text-[var(--dg-color-danger)]"
          >
            {error}
          </p>
        ) : loading ? (
          <p className="m-0 px-5 py-8 text-center text-[13px] text-[var(--dg-color-text-muted)]">
            Loading requests
          </p>
        ) : inPeriod.length === 0 ? (
          <p className="m-0 px-5 py-8 text-center text-[13px] text-[var(--dg-color-text-muted)]">
            No requests sent {range.phrase}.
          </p>
        ) : (
          inPeriod.map((row, index) => (
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
          ))
        )}
      </div>
    </section>
  );
}
