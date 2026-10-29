"use client";

import { useMemo, useState } from "react";
import { Palmtree } from "lucide-react";
import { Button } from "@/components/Button";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildTimeOff, type TimeOffPerson, type TimeOffState } from "@/lib/time-off";
import type { AbsenceType, ShiftMap } from "@/types";

const STATE: Record<TimeOffState, { label: string; tone: StatusPillTone }> = {
  planned: { label: "Planned", tone: "warning" },
  now: { label: "Now", tone: "info" },
  taken: { label: "Taken", tone: "success" },
};

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function formatTimeOffDates(startDate: string, endDate: string): string {
  const start = DAY.format(new Date(`${startDate}T00:00:00Z`));
  if (startDate === endDate) return start;
  return `${start} - ${DAY.format(new Date(`${endDate}T00:00:00Z`))}`;
}

interface TimeOffTabProps {
  person: TimeOffPerson;
  shifts: ShiftMap | undefined;
  loading: boolean;
  range: { startDate: string; endDate: string };
  today: string;
  periodPhrase: string;
  absenceTypes: AbsenceType[];
  dayOffAbsenceTypeId: number | null | undefined;
}

/** Their absences and time away in the period, newest first. */
export function TimeOffTab({
  person,
  shifts,
  loading,
  range,
  today,
  periodPhrase,
  absenceTypes,
  dayOffAbsenceTypeId,
}: TimeOffTabProps) {
  const [includeDayOff, setIncludeDayOff] = useState(false);
  const absenceById = useMemo(
    () => new Map(absenceTypes.map((absence) => [absence.id, absence])),
    [absenceTypes],
  );
  const entries = useMemo(
    () =>
      shifts
        ? buildTimeOff(person, shifts, range, today, absenceById, {
            dayOffAbsenceTypeId,
            includeDayOff,
          })
        : [],
    [absenceById, dayOffAbsenceTypeId, includeDayOff, person, range, shifts, today],
  );
  const dayOffName =
    dayOffAbsenceTypeId != null ? absenceById.get(dayOffAbsenceTypeId)?.name : undefined;

  return (
    <section className="dg-card">
      <div className="dg-card-header flex-wrap gap-3">
        <div>
          <div className="dg-card-title flex items-center gap-2">
            <Palmtree className="h-4 w-4 text-[var(--dg-color-text-muted)]" aria-hidden />
            Time off
          </div>
          <div className="dg-card-subtitle">
            {loading
              ? "Loading time off"
              : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} ${periodPhrase}.`}
          </div>
        </div>
        {dayOffName ? (
          <Button
            type="button"
            className="dg-btn dg-btn-secondary dg-btn-sm"
            aria-pressed={includeDayOff}
            onClick={() => setIncludeDayOff((value) => !value)}
          >
            {includeDayOff ? `Hide ${dayOffName}` : `Show ${dayOffName}`}
          </Button>
        ) : null}
      </div>

      {loading ? null : entries.length === 0 ? (
        <p className="dg-card-body m-0 py-8 text-center text-[13px] text-[var(--dg-color-text-muted)]">
          No time off {periodPhrase}.
        </p>
      ) : (
        <div className="px-2 pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Absence</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.key}>
                  <TableCell className="align-top whitespace-normal">
                    <div className="text-[13px] font-medium text-[var(--dg-color-text-primary)]">
                      {entry.name}
                    </div>
                    {entry.detail ? (
                      <div className="dg-tabular-nums text-[length:var(--dg-type-metadata-size)] text-[var(--dg-color-text-subtle)]">
                        {entry.detail}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="dg-tabular-nums align-top text-[13px]">
                    {entry.kind === "away" && entry.days === null
                      ? `From ${formatTimeOffDates(entry.startDate, entry.startDate)}`
                      : formatTimeOffDates(entry.startDate, entry.endDate)}
                  </TableCell>
                  <TableCell className="dg-tabular-nums text-right align-top text-[13px]">
                    {entry.days ?? (entry.kind === "away" ? "-" : "Part")}
                  </TableCell>
                  <TableCell className="align-top">
                    <StatusPill tone={STATE[entry.state].tone}>
                      {STATE[entry.state].label}
                    </StatusPill>
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
