"use client";

import React, { useLayoutEffect, useRef } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MaybeHint } from "@/components/ui/hint";
import {
  describeAction,
  formatActivityDayDate,
  formatActivityRowDetails,
  formatActivityTime,
  formatActivityTimestamp,
  getAuditActorLabel,
  getAuditActorSecondaryLabel,
  getAuditTargetLabel,
  type ActivityDayGroup,
  type ActivityRowDetails,
} from "@/lib/activity-log-utils";
import { ActivityKindIcon, ActivityKindLabel, type ActivityEntryLike } from "./ActivityLogParts";

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
  const shellRef = useRef<HTMLDivElement>(null);
  useStickyAtScrollEdge(shellRef);
  const columnCount = 3 + (showTarget ? 1 : 0) + (showOrganization ? 1 : 0) + 1;

  return (
    <div ref={shellRef} className="dg-activity-table-shell" data-settings-table-layout="available">
      <Table scrollable={false} className="dg-activity-table">
        <TableHeader>
          <TableRow className="dg-activity-head-row hover:bg-transparent">
            <TableHead className="dg-activity-head--when">Time</TableHead>
            <TableHead className="w-full">Activity</TableHead>
            <TableHead className="dg-activity-head--identity hidden md:table-cell">By</TableHead>
            {showTarget && (
              <TableHead className="dg-activity-head--identity hidden md:table-cell">
                Affected
              </TableHead>
            )}
            {showOrganization && (
              <TableHead className="dg-activity-head--identity hidden lg:table-cell">
                Organization
              </TableHead>
            )}
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

/**
 * A sticky heading stops at the scroll container's padding edge, so rows that
 * scroll past would still show in that padding above it. Pulling the sticky
 * offset up by the padding pins the heading flush to the visible top.
 */
function useStickyAtScrollEdge(shellRef: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    let scroller = shell.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    if (!scroller) return;
    const container = scroller;
    const update = () => {
      const padding = parseFloat(getComputedStyle(container).paddingTop) || 0;
      shell.style.setProperty("--dg-activity-sticky-top", `${-padding}px`);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [shellRef]);
}

function DayCount({ count }: { count: number }) {
  return (
    <>
      <span className="dg-activity-day-separator" aria-hidden>
        ·
      </span>
      <span className="dg-activity-day-count">
        {count} {count === 1 ? "event" : "events"}
      </span>
    </>
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
  const rowDetails = formatActivityRowDetails(entry);
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

      <TableCell className="dg-activity-cell whitespace-normal">
        <div className="dg-activity-main">
          <ActivityKindIcon action={entry.action} />
          <div className="min-w-0">
            <ActivityKindLabel action={entry.action} />
            <div className="dg-activity-description">{description}</div>
            <ActivityRowDetailLines {...rowDetails} />
            <div className="dg-activity-context md:hidden">
              By {actorLabel}
              {showTarget ? ` · Affected: ${targetLabel}` : ""}
            </div>
          </div>
        </div>
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

      <TableCell className="dg-activity-cell dg-activity-cell--chevron">
        <ChevronRight size={14} strokeWidth={2.5} aria-hidden />
      </TableCell>
    </TableRow>
  );
}

function ActivityRowDetailLines({ change, details }: ActivityRowDetails) {
  return (
    <>
      {change && (
        <div className="dg-activity-change">
          {change.before === null ? (
            <span className="dg-activity-change-new">New</span>
          ) : (
            <>
              <span className="dg-activity-change-before">{change.before}</span>
              <ArrowRight
                className="dg-activity-change-arrow"
                size={12}
                strokeWidth={2.25}
                aria-label="changed to"
              />
            </>
          )}
          <span>{change.after}</span>
        </div>
      )}
      {details.length > 0 && (
        <div className="dg-activity-detail-list">
          {details.map((item) => (
            <span className="dg-activity-detail" key={`${item.label}:${item.value}`}>
              <span className="dg-activity-detail-key">{item.label}:</span> {item.value}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function ActivityIdentity({ primary, secondary }: { primary: string; secondary?: string | null }) {
  return (
    <div className="dg-activity-identity">
      <MaybeHint content={secondary && secondary !== primary ? secondary : null}>
        <span className="dg-activity-identity-primary">{primary}</span>
      </MaybeHint>
    </div>
  );
}
