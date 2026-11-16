"use client";

import { NoteDots, overlayNoteDotsWidth } from "@/components/schedule-grid/noteDots";
import { CloseButton } from "@/components/ui/CloseButton";
import { DRAFT_BORDER_COLORS, FILLED_PILL_BORDER, resolveShiftPillColors } from "@/lib/colors";
import type { IndicatorType } from "@/types";
import {
  formatCoverageCount,
  type MonthDay,
  type MonthPersonRow,
  type MonthShiftGroup,
} from "./monthModel";

/** A pill is one short line in the panel, too small for the grid's 9px dots. */
const PANEL_NOTE_DOT_SIZE = 7;

interface MonthDayPanelProps {
  day: MonthDay;
  isNameMode: boolean;
  hasSearch: boolean;
  isDark: boolean;
  indicatorTypes: IndicatorType[];
  onClose?: () => void;
  onOpenWeek?: (date: Date) => void;
}

const DRAFT_TAG: Record<string, string> = {
  new: "Draft, added",
  modified: "Draft, changed",
  deleted: "Draft, removed",
};

function pillText(label: string, max: number): string {
  if (label.length <= max) return label;
  return label.slice(0, max - 1).trimEnd() + "…";
}

function summaryOf(day: MonthDay): string {
  const parts = [`${day.working} working`];
  if (day.absent > 0) parts.push(`${day.absent} absent`);
  if (day.openShifts.length > 0) {
    parts.push(`${day.openShifts.length} open shift${day.openShifts.length === 1 ? "" : "s"}`);
  }
  if (day.short > 0) parts.push(`${formatCoverageCount(day.short)} short`);
  return parts.join(" · ");
}

function groupStatus(group: MonthShiftGroup): string {
  if (group.coverage.length === 1) {
    const [line] = group.coverage;
    return line.short > 0
      ? `${formatCoverageCount(line.short)} short of ${formatCoverageCount(line.required)}`
      : `${formatCoverageCount(line.actual)} of ${formatCoverageCount(line.required)}`;
  }
  if (group.coverage.length > 1) {
    return group.short > 0 ? `${formatCoverageCount(group.short)} short` : "Staffed";
  }
  return `${group.people.length} working`;
}

function PersonRow({
  row,
  isNameMode,
  hasSearch,
  isDark,
  indicatorTypes,
}: {
  row: MonthPersonRow;
  isNameMode: boolean;
  hasSearch: boolean;
  isDark: boolean;
  indicatorTypes: IndicatorType[];
}) {
  const colors = resolveShiftPillColors(
    { color: row.style.color, text: row.style.text, border: row.style.border },
    isDark,
  );
  const dotsRoom =
    row.marks.length > 0 ? overlayNoteDotsWidth(row.marks.length, PANEL_NOTE_DOT_SIZE) : 0;
  const tag = row.request?.status ?? (row.draftKind ? DRAFT_TAG[row.draftKind] : null);
  const tone = row.request
    ? row.request.waitingOn === "manager"
      ? "manager"
      : "teammate"
    : row.draftKind
      ? "draft"
      : undefined;
  return (
    <div
      className="dg-month-person"
      data-search-hit={(hasSearch && row.isHighlighted) || undefined}
      data-search-miss={(hasSearch && !row.isHighlighted) || undefined}
    >
      <span
        className="dg-month-person__pill"
        data-deleted={row.draftKind === "deleted" || undefined}
        style={{
          background: colors.color,
          color: colors.text,
          border: row.draftKind
            ? `2px dashed ${DRAFT_BORDER_COLORS[row.draftKind]}`
            : FILLED_PILL_BORDER,
          paddingRight: dotsRoom ? 6 + dotsRoom : undefined,
        }}
      >
        {isNameMode ? pillText(row.label, 14) : row.label}
        <NoteDots
          marks={row.marks}
          indicatorTypes={indicatorTypes}
          placement="overlay"
          rimColor={colors.text}
          isDark={isDark}
          dotSize={PANEL_NOTE_DOT_SIZE}
        />
      </span>
      <span className="dg-month-person__name">{row.name}</span>
      {tag && (
        <span className="dg-month-person__tag" data-tone={tone}>
          {tag}
        </span>
      )}
    </div>
  );
}

function OffSection({
  title,
  rows,
  hasSearch,
  showAbsence,
}: {
  title: string;
  rows: MonthDay["off"];
  hasSearch: boolean;
  showAbsence: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="dg-month-panel__section">
      <h3 className="dg-month-panel__heading">{title}</h3>
      {rows.map((row) => (
        <div
          key={row.empId}
          className="dg-month-person"
          data-search-hit={(hasSearch && row.isHighlighted) || undefined}
          data-search-miss={(hasSearch && !row.isHighlighted) || undefined}
        >
          <span className="dg-month-person__name">{row.name}</span>
          {showAbsence && <span className="dg-month-person__tag">{row.absence}</span>}
        </div>
      ))}
    </div>
  );
}

export function MonthDayPanel({
  day,
  isNameMode,
  hasSearch,
  isDark,
  indicatorTypes,
  onClose,
  onOpenWeek,
}: MonthDayPanelProps) {
  const title = day.date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const isEmpty =
    day.areas.length === 0 &&
    day.openShifts.length === 0 &&
    day.off.length === 0 &&
    day.otherRequests.length === 0;

  return (
    <section className="dg-month-panel" aria-label={`${title} details`}>
      <div className="dg-month-panel__head">
        <div className="dg-month-panel__title-row">
          <div className="dg-month-panel__title-text">
            <h2 className="dg-month-panel__title">
              {title}
              {day.isToday ? " (today)" : ""}
            </h2>
            <p className="dg-month-panel__summary dg-tabular-nums">{summaryOf(day)}</p>
          </div>
          {onClose && <CloseButton size="lg" onClick={onClose} aria-label="Close day details" />}
        </div>
        {onOpenWeek && (
          <button
            type="button"
            className="dg-btn dg-btn-secondary dg-month-panel__open-week"
            onClick={() => onOpenWeek(day.date)}
          >
            Open this week
          </button>
        )}
      </div>
      <div className="dg-month-panel__body">
        {isEmpty && <p className="dg-month-empty">Nothing scheduled.</p>}
        {day.areas.map((area) => (
          <div key={area.focusAreaId} className="dg-month-panel__section">
            <h3 className="dg-month-panel__heading">{area.name}</h3>
            {area.groups.map((group) => (
              <div key={group.key} className="dg-month-group">
                <div className="dg-month-group__head">
                  <span className="dg-month-group__name">{group.name}</span>
                  {group.hours && <span className="dg-month-group__hours">{group.hours}</span>}
                  <span
                    className="dg-month-group__status dg-tabular-nums"
                    data-short={group.short > 0 || undefined}
                  >
                    {groupStatus(group)}
                  </span>
                </div>
                {group.coverage.length > 1 &&
                  group.coverage.map((line) => (
                    <p
                      key={line.label}
                      className="dg-month-coverage-line dg-tabular-nums"
                      data-short={line.short > 0 || undefined}
                    >
                      <span>{line.label}</span>
                      <span>
                        {line.short > 0
                          ? `${formatCoverageCount(line.short)} short of ${formatCoverageCount(line.required)}`
                          : `${formatCoverageCount(line.actual)} of ${formatCoverageCount(line.required)}`}
                      </span>
                    </p>
                  ))}
                {group.people.map((row, index) => (
                  <PersonRow
                    key={`${row.empId}-${index}`}
                    row={row}
                    isNameMode={isNameMode}
                    hasSearch={hasSearch}
                    isDark={isDark}
                    indicatorTypes={indicatorTypes}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
        {day.openShifts.length > 0 && (
          <div className="dg-month-panel__section">
            <h3 className="dg-month-panel__heading">Open shifts</h3>
            {day.openShifts.map((shift) => (
              <div key={shift.id} className="dg-month-person">
                <span className="dg-month-person__pill" data-open>
                  Open
                </span>
                <span className="dg-month-person__name">
                  {[shift.label, shift.areaName, shift.hours].filter(Boolean).join(" · ")}
                </span>
                {shift.detail && <span className="dg-month-person__tag">{shift.detail}</span>}
              </div>
            ))}
          </div>
        )}
        {day.otherRequests.length > 0 && (
          <div className="dg-month-panel__section">
            <h3 className="dg-month-panel__heading">Requests</h3>
            {day.otherRequests.map(({ empId, name, request }) => (
              <div key={empId} className="dg-month-person">
                <span className="dg-month-person__name">{name}</span>
                <span
                  className="dg-month-person__tag"
                  data-tone={request.waitingOn === "manager" ? "manager" : "teammate"}
                >
                  {request.status}
                </span>
              </div>
            ))}
          </div>
        )}
        <OffSection
          title="Absent"
          rows={day.off.filter((row) => !row.isDayOff)}
          hasSearch={hasSearch}
          showAbsence
        />
        <OffSection
          title="Day off"
          rows={day.off.filter((row) => row.isDayOff)}
          hasSearch={hasSearch}
          showAbsence={false}
        />
      </div>
    </section>
  );
}
