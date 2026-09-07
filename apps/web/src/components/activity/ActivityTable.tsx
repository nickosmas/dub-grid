"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusPill } from "@/components/ui/status-pill";
import { MaybeHint } from "@/components/ui/hint";
import {
  describeAction,
  formatActivityDayDate,
  formatActivityTime,
  formatActivityTimestamp,
  formatDetails,
  getAuditActorLabel,
  getAuditActorSecondaryLabel,
  getAuditTargetLabel,
  type ActivityDayGroup,
} from "@/lib/activity-log-utils";
import { ActionBadge, type ActivityEntryLike } from "./ActivityLogParts";

export type ActivityTableEntry = ActivityEntryLike & { id: string | number };

interface ActivityTableProps<T extends ActivityTableEntry> {
  groups: ActivityDayGroup<T>[];
  timeZone: string | null;
  /** Who or what the event acted on. Off on a person's own page, where it is always them. */
  showTarget?: boolean;
  /** Which organization the event belongs to. Gridmaster's platform-wide view only. */
  showOrganization?: boolean;
  /**
   * True per-day totals for the period. A loaded page can hold fewer rows than
   * the day actually has, so prefer these when the caller knows them.
   */
  dayCounts?: Record<string, number>;
  onSelect: (entry: T) => void;
}

export function ActivityTable<T extends ActivityTableEntry>({
  groups,
  timeZone,
  showTarget = true,
  showOrganization = false,
  dayCounts,
  onSelect,
}: ActivityTableProps<T>) {
  const columnCount = 4 + (showTarget ? 1 : 0) + (showOrganization ? 1 : 0);

  return (
    <div className="dg-activity-table-shell">
      <Table scrollable={false} className="dg-activity-table">
        <TableHeader>
          <TableRow className="dg-activity-head-row hover:bg-transparent">
            <TableHead>Time</TableHead>
            <TableHead className="hidden sm:table-cell">Activity type</TableHead>
            <TableHead className="hidden md:table-cell">Performed by</TableHead>
            {showTarget && <TableHead className="hidden md:table-cell">Target changed</TableHead>}
            {showOrganization && (
              <TableHead className="hidden lg:table-cell">Organization</TableHead>
            )}
            <TableHead className="w-full">Activity and changes</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <React.Fragment key={group.dateKey}>
              <tr className="dg-activity-day-row">
                <th scope="colgroup" colSpan={columnCount} className="dg-activity-day-heading">
                  <div className="dg-activity-day-heading-inner">
                    <span className="dg-activity-day-label">{group.label}</span>
                    {group.label === "Today" || group.label === "Yesterday" ? (
                      <span className="dg-activity-day-date">
                        {formatActivityDayDate(group.dateKey)}
                      </span>
                    ) : null}
                    <DayCount count={dayCounts?.[group.dateKey] ?? group.entries.length} />
                  </div>
                </th>
              </tr>
              {group.entries.map((entry) => (
                <ActivityRow
                  key={entry.id}
                  entry={entry}
                  timeZone={timeZone}
                  showTarget={showTarget}
                  showOrganization={showOrganization}
                  onSelect={onSelect}
                />
              ))}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DayCount({ count }: { count: number }) {
  return (
    <StatusPill variant="category" aria-label={`${count} ${count === 1 ? "event" : "events"}`}>
      {count}
    </StatusPill>
  );
}

function ActivityRow<T extends ActivityTableEntry>({
  entry,
  timeZone,
  showTarget,
  showOrganization,
  onSelect,
}: {
  entry: T;
  timeZone: string | null;
  showTarget: boolean;
  showOrganization: boolean;
  onSelect: (entry: T) => void;
}) {
  const description = describeAction(entry);
  const details = formatDetails(entry);
  const actorLabel = getAuditActorLabel(entry);
  const targetLabel = getAuditTargetLabel(entry);

  return (
    <TableRow
      className="dg-activity-row"
      tabIndex={0}
      aria-label={`${description}. Open details`}
      onClick={() => onSelect(entry)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect(entry);
      }}
    >
      <TableCell className="dg-activity-cell dg-activity-cell--when">
        <MaybeHint content={formatActivityTimestamp(entry.createdAt, timeZone)}>
          <span className="dg-activity-time">{formatActivityTime(entry.createdAt, timeZone)}</span>
        </MaybeHint>
      </TableCell>

      <TableCell className="dg-activity-cell dg-activity-cell--type hidden sm:table-cell">
        <ActionBadge action={entry.action} />
      </TableCell>

      <TableCell className="dg-activity-cell dg-activity-cell--identity hidden md:table-cell">
        <ActivityIdentity primary={actorLabel} secondary={getAuditActorSecondaryLabel(entry)} />
      </TableCell>

      {showTarget && (
        <TableCell className="dg-activity-cell dg-activity-cell--identity hidden md:table-cell">
          <ActivityIdentity
            primary={targetLabel}
            secondary={entry.targetLabel ? entry.targetEmail : null}
          />
        </TableCell>
      )}

      {showOrganization && (
        <TableCell className="dg-activity-cell dg-activity-cell--identity hidden lg:table-cell">
          <ActivityIdentity
            primary={entry.orgName ?? (entry.orgId ? "Unknown organization" : "Platform-wide")}
          />
        </TableCell>
      )}

      <TableCell className="dg-activity-cell whitespace-normal">
        <div className="mb-1 sm:hidden">
          <ActionBadge action={entry.action} />
        </div>
        <div className="dg-activity-description">{description}</div>
        {details.length > 0 && (
          <div className="dg-activity-detail-list">
            {details.map((item) => (
              <div key={`${item.label}:${item.value}`}>
                <span className="dg-activity-detail-key">{item.label}:</span> {item.value}
              </div>
            ))}
          </div>
        )}
        <div className="dg-activity-context md:hidden">
          Performed by {actorLabel}
          {showTarget ? ` · Target: ${targetLabel}` : ""}
        </div>
      </TableCell>

      <TableCell className="dg-activity-cell dg-activity-cell--chevron">
        <ChevronRight size={14} strokeWidth={2.5} aria-hidden />
      </TableCell>
    </TableRow>
  );
}

function ActivityIdentity({ primary, secondary }: { primary: string; secondary?: string | null }) {
  const showSecondary = secondary && secondary !== primary;
  return (
    <div className="dg-activity-identity">
      <div className="dg-activity-identity-primary">{primary}</div>
      {showSecondary && <div className="dg-activity-identity-secondary">{secondary}</div>}
    </div>
  );
}
