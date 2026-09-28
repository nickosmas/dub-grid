"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/ui/status-pill";
import { fetchGridmasterStaffActivity } from "@/features/gridmaster/client";
import type {
  GridmasterPersonSchedule,
  GridmasterScheduledDay,
  GridmasterShiftRequest,
} from "@/features/gridmaster/person-record";
import { queryKeys } from "@/lib/query-keys";
import { formatDay, formatMoment } from "./person-format";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const REQUEST_TYPES: Record<GridmasterShiftRequest["type"], string> = {
  pickup: "Pickup",
  swap: "Swap",
  calloff: "Call-off",
};
const SOURCES: Record<GridmasterScheduledDay["source"], string> = {
  recurring: "from the recurring schedule",
  series: "from a series",
  manual: "added by hand",
};

function words(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function actor(schedule: GridmasterPersonSchedule, id: string | null): string | null {
  return id ? (schedule.actors[id] ?? id) : null;
}

function Group({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h5 className="dg-type-field-title">{title}</h5>
      {children.length === 0 ? (
        <p className="text-[13px] text-[var(--dg-color-text-muted)]">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--dg-color-border-light)]">{children}</ul>
      )}
    </div>
  );
}

function Row({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <li className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
      <div className="text-[13px] text-[var(--dg-color-text-primary)]">{primary}</div>
      {secondary ? (
        <div className="dg-tabular-nums text-[12px] text-[var(--dg-color-text-muted)]">
          {secondary}
        </div>
      ) : null}
    </li>
  );
}

function dayLine(day: GridmasterScheduledDay): string {
  const published = day.published === null ? "Not published" : day.published || "Removed";
  if (day.draft === null) return published;
  return `${published}, draft ${day.draft === "" ? "removes it" : `changes it to ${day.draft}`}`;
}

function ScheduleDetail({ schedule }: { schedule: GridmasterPersonSchedule }) {
  const indicatorsByDate = new Map<string, string[]>();
  for (const indicator of schedule.indicators) {
    const label =
      indicator.status === "published"
        ? indicator.name
        : `${indicator.name} (${indicator.status === "draft" ? "draft" : "draft removal"})`;
    indicatorsByDate.set(indicator.date, [...(indicatorsByDate.get(indicator.date) ?? []), label]);
  }

  return (
    <div className="flex flex-col gap-5">
      <Group title="Recurring schedule" empty="No recurring shifts or series.">
        {[
          ...schedule.recurring.map((shift) => (
            <Row
              key={`recurring-${shift.id}`}
              primary={`${WEEKDAYS[shift.dayOfWeek] ?? `Day ${shift.dayOfWeek}`}: ${shift.label || "Nothing scheduled"}`}
              secondary={[
                `From ${formatDay(shift.effectiveFrom)}`,
                shift.effectiveUntil ? `until ${formatDay(shift.effectiveUntil)}` : null,
                shift.archivedAt ? `archived ${formatDay(shift.archivedAt)}` : null,
              ]
                .filter(Boolean)
                .join(", ")}
            />
          )),
          ...schedule.series.map((series) => (
            <Row
              key={`series-${series.id}`}
              primary={`${words(series.frequency)} series: ${series.label || "Nothing scheduled"}`}
              secondary={[
                series.daysOfWeek.length > 0
                  ? series.daysOfWeek.map((day) => WEEKDAYS[day] ?? day).join(", ")
                  : null,
                `from ${formatDay(series.startDate)}`,
                series.endDate ? `until ${formatDay(series.endDate)}` : null,
                series.maxOccurrences ? `${series.maxOccurrences} times` : null,
                series.archivedAt ? `archived ${formatDay(series.archivedAt)}` : null,
              ]
                .filter(Boolean)
                .join(", ")}
            />
          )),
        ]}
      </Group>

      <Group
        title={`Shifts, ${formatDay(schedule.window.from)} to ${formatDay(schedule.window.to)}`}
        empty="Nothing scheduled in this window."
      >
        {schedule.shifts.map((day) => {
          const indicators = indicatorsByDate.get(day.date);
          return (
            <Row
              key={day.date}
              primary={
                <>
                  <span className="dg-tabular-nums">{formatDay(day.date)}</span>: {dayLine(day)}
                </>
              }
              secondary={[
                day.customStart && day.customEnd ? `${day.customStart} to ${day.customEnd}` : null,
                SOURCES[day.source],
                indicators ? `Schedule notes: ${indicators.join(", ")}` : null,
              ]
                .filter(Boolean)
                .join(", ")}
            />
          );
        })}
      </Group>

      <Group title="Publish changes, last 90 days" empty="No published changes.">
        {schedule.publishChanges.map((change, index) => (
          <Row
            key={`${change.publishedAt}-${change.date}-${index}`}
            primary={`${formatDay(change.date)}: ${change.from ?? "Nothing"} to ${change.to ?? "nothing"}`}
            secondary={[
              `Published ${formatMoment(change.publishedAt)}`,
              actor(schedule, change.publishedBy)
                ? `by ${actor(schedule, change.publishedBy)}`
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
          />
        ))}
      </Group>

      <Group title="Shift requests, open and last 90 days" empty="No shift requests.">
        {schedule.shiftRequests.map((request) => (
          <Row
            key={request.id}
            primary={
              <span className="flex flex-wrap items-center gap-2">
                <StatusPill tone="neutral">{words(request.status)}</StatusPill>
                {REQUEST_TYPES[request.type] ?? words(request.type)}
                {request.side === "requester" ? " they asked for" : " asked of them"}
                {request.partner ? `, with ${request.partner}` : ""}
              </span>
            }
            secondary={[
              request.shiftDate ? `Their shift ${formatDay(request.shiftDate)}` : null,
              request.partnerShiftDate ? `partner's ${formatDay(request.partnerShiftDate)}` : null,
              `asked ${formatMoment(request.createdAt)}`,
              request.resolvedAt ? `settled ${formatMoment(request.resolvedAt)}` : null,
              actor(schedule, request.settledBy)
                ? `by ${actor(schedule, request.settledBy)}`
                : null,
              request.adminNote ? `note: ${request.adminNote}` : null,
            ]
              .filter(Boolean)
              .join(", ")}
          />
        ))}
      </Group>

      <Group
        title="Profile change requests, open and last 90 days"
        empty="No profile change requests."
      >
        {schedule.profileChangeRequests.map((request) => (
          <Row
            key={request.id}
            primary={
              <span className="flex flex-wrap items-center gap-2">
                <StatusPill tone="neutral">{words(request.status)}</StatusPill>
                {words(request.type)}:{" "}
                {Object.entries(request.requested)
                  .map(([field, value]) => `${words(field)} ${String(value)}`)
                  .join(", ") || "no fields"}
              </span>
            }
            secondary={[
              `asked ${formatMoment(request.createdAt)}`,
              request.note ? `note: ${request.note}` : null,
              request.resolvedAt ? `settled ${formatMoment(request.resolvedAt)}` : null,
              actor(schedule, request.resolvedBy)
                ? `by ${actor(schedule, request.resolvedBy)}`
                : null,
              request.resolverNote ? `reply: ${request.resolverNote}` : null,
            ]
              .filter(Boolean)
              .join(", ")}
          />
        ))}
      </Group>
    </div>
  );
}

/** One staff record's schedule and requests, fetched only once it is opened. */
export function PersonScheduleSection({ employeeId }: { employeeId: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: queryKeys.gridmaster.personActivity(employeeId),
    queryFn: () => fetchGridmasterStaffActivity(employeeId),
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col gap-3 rounded-[var(--dg-radius-md)] border border-[var(--dg-color-border-light)] p-3">
      <Button
        className="dg-btn dg-btn-ghost dg-btn-sm self-start"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "Hide schedule and requests" : "Show schedule and requests"}
      </Button>
      {!open ? null : query.isPending ? (
        <p className="text-[13px] text-[var(--dg-color-text-muted)]">Loading the schedule</p>
      ) : query.isError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] text-[var(--dg-color-danger-text)]">
            {query.error instanceof Error ? query.error.message : "We couldn't load this schedule."}
          </p>
          <Button
            className="dg-btn dg-btn-secondary dg-btn-sm"
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : (
        <ScheduleDetail schedule={query.data.schedule} />
      )}
    </div>
  );
}
