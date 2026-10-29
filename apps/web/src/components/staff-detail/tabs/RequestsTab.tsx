"use client";

import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import CustomSelect from "@/components/CustomSelect";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requestRowsInRange, type PersonRequestRow } from "@/lib/person-requests";

type StateFilter = "all" | "waiting" | "decided";

const SENT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

interface RequestsTabProps {
  rows: PersonRequestRow[] | undefined;
  loading: boolean;
  error: string | null;
  range: { startDate: string; endDate: string };
  periodPhrase: string;
}

/** Pickups, swaps, call-offs and profile change requests involving them. */
export function RequestsTab({ rows, loading, error, range, periodPhrase }: RequestsTabProps) {
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const inPeriod = useMemo(() => requestRowsInRange(rows ?? [], range), [range, rows]);
  const shown = useMemo(
    () =>
      inPeriod.filter((row) =>
        stateFilter === "all" ? true : stateFilter === "waiting" ? row.waiting : !row.waiting,
      ),
    [inPeriod, stateFilter],
  );

  return (
    <section className="dg-card">
      <div className="dg-card-header flex-wrap gap-3">
        <div>
          <div className="dg-card-title flex items-center gap-2">
            <Inbox className="h-4 w-4 text-[var(--dg-color-text-muted)]" aria-hidden />
            Requests
          </div>
          <div className="dg-card-subtitle">
            {loading
              ? "Loading requests"
              : `${inPeriod.length} ${inPeriod.length === 1 ? "request" : "requests"} sent ${periodPhrase}.`}
          </div>
        </div>
        <CustomSelect<StateFilter>
          value={stateFilter}
          onChange={setStateFilter}
          ariaLabel="Filter by state"
          options={[
            { value: "all", label: "All requests" },
            { value: "waiting", label: "Awaiting approval" },
            { value: "decided", label: "Decided or closed" },
          ]}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="dg-card-body m-0 py-8 text-center text-[13px] text-[var(--dg-color-danger)]"
        >
          {error}
        </p>
      ) : loading ? null : shown.length === 0 ? (
        <p className="dg-card-body m-0 py-8 text-center text-[13px] text-[var(--dg-color-text-muted)]">
          {inPeriod.length === 0
            ? `No requests sent ${periodPhrase}.`
            : "No requests match this filter."}
        </p>
      ) : (
        <div className="px-2 pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="align-top text-[13px] font-medium text-[var(--dg-color-text-primary)]">
                    {row.type}
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    <div className="dg-tabular-nums text-[13px] text-[var(--dg-color-text-primary)]">
                      {row.details}
                    </div>
                    {row.secondary ? (
                      <div className="text-[length:var(--dg-type-metadata-size)] text-[var(--dg-color-text-subtle)]">
                        {row.secondary}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="dg-tabular-nums align-top text-[13px]">
                    {SENT.format(new Date(`${row.sentDate}T00:00:00Z`))}
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    <StatusPill tone={row.tone}>{row.state}</StatusPill>
                    {row.decidedBy ? (
                      <div className="mt-1 text-[length:var(--dg-type-metadata-size)] text-[var(--dg-color-text-subtle)]">
                        by {row.decidedBy}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
