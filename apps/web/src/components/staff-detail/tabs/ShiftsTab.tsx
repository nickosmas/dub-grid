"use client";

import { useMemo, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/Button";
import CustomSelect from "@/components/CustomSelect";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsvFile } from "@/lib/export-csv";
import {
  buildShiftRecords,
  shiftRecordStateLabel,
  shiftRecordsToCsv,
  type ShiftRecordLookups,
  type ShiftRecordState,
} from "@/lib/shift-records";
import type { Employee, ShiftMap } from "@/types";

type StateFilter = "all" | ShiftRecordState;

const STATE_TONES: Record<ShiftRecordState, StatusPillTone> = {
  draft: "info",
  published: "success",
  corrected: "neutral",
};

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

interface ShiftsTabProps {
  employee: Employee;
  /** The period's shifts; undefined while they load. */
  shifts: ShiftMap | undefined;
  loading: boolean;
  range: { startDate: string; endDate: string };
  periodPhrase: string;
  lookups: ShiftRecordLookups;
  corrections?: ReadonlyMap<string, string | null>;
  noteCounts?: ReadonlyMap<string, number>;
}

/** Every shift they had in the period, spelled out, newest first. */
export function ShiftsTab({
  employee,
  shifts,
  loading,
  range,
  periodPhrase,
  lookups,
  corrections,
  noteCounts,
}: ShiftsTabProps) {
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const records = useMemo(
    () =>
      shifts
        ? buildShiftRecords(employee.id, shifts, range, lookups, { corrections, noteCounts })
        : [],
    [corrections, employee.id, lookups, noteCounts, range, shifts],
  );
  const shown = useMemo(
    () => records.filter((record) => stateFilter === "all" || record.state === stateFilter),
    [records, stateFilter],
  );
  const totalHours = Math.round(shown.reduce((sum, record) => sum + record.hours, 0) * 10) / 10;

  const exportCsv = () =>
    downloadCsvFile(
      shiftRecordsToCsv(shown),
      `${employee.firstName}-${employee.lastName}-shifts-${range.startDate}-to-${range.endDate}.csv`
        .toLowerCase()
        .replace(/[^a-z0-9.-]+/g, "-"),
    );

  return (
    <section className="dg-card">
      <div className="dg-card-header flex-wrap gap-3">
        <div>
          <div className="dg-card-title flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-[var(--dg-color-text-muted)]" aria-hidden />
            Shifts
          </div>
          <div className="dg-card-subtitle">
            {loading
              ? "Loading shifts"
              : `${shown.length} ${shown.length === 1 ? "shift" : "shifts"}, ${totalHours} hours ${periodPhrase}.`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CustomSelect<StateFilter>
            value={stateFilter}
            onChange={setStateFilter}
            ariaLabel="Filter by state"
            options={[
              { value: "all", label: "All states" },
              { value: "published", label: "Published" },
              { value: "draft", label: "Draft" },
              { value: "corrected", label: "Corrected" },
            ]}
          />
          <Button
            type="button"
            className="dg-btn dg-btn-secondary"
            onClick={exportCsv}
            disabled={shown.length === 0}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {loading ? null : shown.length === 0 ? (
        <p className="dg-card-body m-0 py-8 text-center text-[13px] text-[var(--dg-color-text-muted)]">
          {records.length === 0 ? `No shifts ${periodPhrase}.` : "No shifts match this filter."}
        </p>
      ) : (
        <div className="px-2 pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((record) => (
                <TableRow key={record.date}>
                  <TableCell className="dg-tabular-nums align-top text-[13px]">
                    {DAY_FORMAT.format(new Date(`${record.date}T00:00:00Z`))}
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    {record.shifts.map((shift, index) => (
                      <div key={`${shift.name}-${index}`} className="text-[13px]">
                        <span className="font-medium text-[var(--dg-color-text-primary)]">
                          {shift.name}
                        </span>
                        {shift.jobName ? (
                          <span className="text-[var(--dg-color-text-muted)]">
                            {" "}
                            · {shift.jobName}
                          </span>
                        ) : null}
                        {shift.time ? (
                          <div className="dg-tabular-nums text-[length:var(--dg-type-metadata-size)] text-[var(--dg-color-text-subtle)]">
                            {shift.time}
                          </div>
                        ) : null}
                      </div>
                    ))}
                    <div className="text-[length:var(--dg-type-metadata-size)] text-[var(--dg-color-text-subtle)]">
                      {[
                        record.focusArea,
                        record.absenceName ? `${record.absenceName} beside it` : null,
                        record.noteCount > 0
                          ? `${record.noteCount} schedule ${record.noteCount === 1 ? "note" : "notes"}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell className="dg-tabular-nums text-right align-top text-[13px]">
                    {Math.round(record.hours * 10) / 10}
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    <StatusPill tone={STATE_TONES[record.state]}>
                      {shiftRecordStateLabel(record)}
                    </StatusPill>
                    {record.was ? (
                      <div className="mt-1 text-[length:var(--dg-type-metadata-size)] text-[var(--dg-color-text-subtle)]">
                        Was {record.was}
                      </div>
                    ) : null}
                    {record.correctionReason ? (
                      <div className="mt-1 text-[length:var(--dg-type-metadata-size)] text-[var(--dg-color-text-subtle)]">
                        {record.correctionReason}
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
