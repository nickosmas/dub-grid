"use client";

import { useState, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import {
  MAX_DAYS_IN_A_ROW,
  MAX_DAYS_IN_A_ROW_STRETCHED,
  MAX_DAYS_IN_A_WEEK,
  MAX_DAYS_IN_A_WEEK_STRETCHED,
  WEEKLY_OVERTIME_HOURS,
  formatLocalDateKey,
  parseLocalDateKey,
  type CoverageBuildPreview,
  type CoverageBuildProgress,
  type CoverageFairChoice,
  type CoverageOverThreshold,
  type CoverageRuledOut,
  type CoverageSkippedRecurring,
} from "@dubgrid/schedule-core";
import { Button } from "@/components/Button";
import { Loader } from "lucide-react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { formatCoverageNumber, pluralize } from "./coverage-check-text";

export type ScheduleBuildState =
  | { status: "idle" }
  /** `progress` is null while the build's data is still loading. */
  | { status: "previewing"; progress: CoverageBuildProgress | null }
  | { status: "failed" }
  | { status: "ready"; preview: CoverageBuildPreview }
  /** Being applied: `saved` is null while the plan is checked again. */
  | {
      status: "applying";
      preview: CoverageBuildPreview;
      checking: CoverageBuildProgress | null;
      saved: number | null;
      total: number;
    }
  /** Built: the preview it applied, as the report of what it did. */
  | { status: "built"; preview: CoverageBuildPreview };

/** Words for the people a build names, from the page's own lookups. */
export interface SkippedWords {
  personName: (employeeId: string) => string;
  formatDate: (dateKey: string) => string;
  reason: (entry: CoverageRuledOut) => string;
  /** A requirement row's name, such as "Day Shift · Supervisor". */
  rowLabel: (rowKey: string) => string;
  /** The day off absence's name, or null when the organization has none. */
  dayOffName?: string | null;
}

interface SkippedPerson {
  employeeId: string;
  name: string;
  lines: string[];
}

/** One entry per person, each date and reason once, people by name. */
export function groupSkipped(
  skipped: ReadonlyArray<CoverageRuledOut>,
  words: SkippedWords,
): SkippedPerson[] {
  const byPerson = new Map<string, CoverageRuledOut[]>();
  for (const entry of skipped) {
    byPerson.set(entry.employeeId, [...(byPerson.get(entry.employeeId) ?? []), entry]);
  }
  return [...byPerson.entries()]
    .map(([employeeId, entries]) => ({
      employeeId,
      name: words.personName(employeeId),
      lines: [
        ...new Set(
          [...entries]
            .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
            .map((entry) => `${words.formatDate(entry.dateKey)}: ${words.reason(entry)}`),
        ),
      ],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "Ana Diaz", "44 hours, week of Sun, Oct 25": once per person and week. */
export function overThresholdLines(
  entries: ReadonlyArray<CoverageOverThreshold>,
  words: SkippedWords,
): { key: string; name: string; detail: string }[] {
  const byWeek = new Map<string, { employeeId: string; weekStart: string; hours: number }>();
  for (const entry of entries) {
    const date = parseLocalDateKey(entry.dateKey);
    date.setDate(date.getDate() - date.getDay());
    const weekStart = formatLocalDateKey(date);
    const key = `${entry.employeeId}|${weekStart}`;
    const hours = Math.max(entry.hours, byWeek.get(key)?.hours ?? 0);
    byWeek.set(key, { employeeId: entry.employeeId, weekStart, hours });
  }
  return [...byWeek.entries()]
    .map(([key, week]) => ({
      key,
      name: words.personName(week.employeeId),
      weekStart: week.weekStart,
      detail: `${formatCoverageNumber(week.hours)} hours, week of ${words.formatDate(week.weekStart)}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.weekStart.localeCompare(b.weekStart))
    .map(({ key, name, detail }) => ({ key, name, detail }));
}

/** "Ana Diaz", "Fri, Oct 30, Sat, Oct 31": each person's dates, by name. */
export function recurringSkippedLines(
  entries: ReadonlyArray<{ employeeId: string; dateKey: string }>,
  words: Pick<SkippedWords, "personName" | "formatDate">,
): { key: string; name: string; detail: string }[] {
  const byPerson = new Map<string, string[]>();
  for (const entry of [...entries].sort((a, b) => a.dateKey.localeCompare(b.dateKey))) {
    byPerson.set(entry.employeeId, [...(byPerson.get(entry.employeeId) ?? []), entry.dateKey]);
  }
  return [...byPerson.entries()]
    .map(([employeeId, dateKeys]) => ({
      key: employeeId,
      name: words.personName(employeeId),
      detail: dateKeys.map(words.formatDate).join(", "),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function RecurringSkipped({
  entries,
  words,
}: {
  entries: ReadonlyArray<CoverageSkippedRecurring>;
  words: SkippedWords;
}) {
  if (entries.length === 0) return null;
  const caption = "Recurring shifts left out: too many days in a row or in a week";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="dg-cc-caption">{caption}</div>
      <NameList label={caption} rows={recurringSkippedLines(entries, words)} />
    </div>
  );
}

/** "Ana Diaz", "Sun, Oct 25 to Fri, Oct 30": each person's runs of days, by name. */
export function runLines(
  entries: ReadonlyArray<{ employeeId: string; dateKey: string }>,
  words: Pick<SkippedWords, "personName" | "formatDate">,
): { key: string; name: string; detail: string }[] {
  const byPerson = new Map<string, string[]>();
  for (const entry of entries) {
    byPerson.set(entry.employeeId, [...(byPerson.get(entry.employeeId) ?? []), entry.dateKey]);
  }
  const nextDay = (dateKey: string) => {
    const date = parseLocalDateKey(dateKey);
    date.setDate(date.getDate() + 1);
    return formatLocalDateKey(date);
  };
  return [...byPerson.entries()]
    .map(([employeeId, dateKeys]) => {
      const runs: string[][] = [];
      for (const dateKey of [...new Set(dateKeys)].sort()) {
        const last = runs.at(-1);
        if (last && nextDay(last[last.length - 1]) === dateKey) last.push(dateKey);
        else runs.push([dateKey]);
      }
      return {
        key: employeeId,
        name: words.personName(employeeId),
        detail: runs
          .map((run) =>
            run.length === 1
              ? words.formatDate(run[0])
              : `${words.formatDate(run[0])} to ${words.formatDate(run[run.length - 1])}`,
          )
          .join(", "),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Everyone the build gives a sixth day, by week and by run. */
function SixthDays({ preview, words }: { preview: CoverageBuildPreview; words: SkippedWords }) {
  const weekCaption = `${MAX_DAYS_IN_A_WEEK_STRETCHED} days in a week`;
  const runCaption = `${MAX_DAYS_IN_A_ROW_STRETCHED} days in a row`;
  const weeks = recurringSkippedLines(
    preview.sixthWeeks.map(({ employeeId, weekStart }) => ({ employeeId, dateKey: weekStart })),
    { ...words, formatDate: (dateKey) => `week of ${words.formatDate(dateKey)}` },
  );
  return (
    <>
      {weeks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="dg-cc-caption">{weekCaption}</div>
          <NameList label={weekCaption} rows={weeks} />
        </div>
      )}
      {preview.sixthDays.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="dg-cc-caption">{runCaption}</div>
          <NameList label={runCaption} rows={runLines(preview.sixthDays, words)} />
        </div>
      )}
    </>
  );
}

function NameList({
  label,
  rows,
}: {
  label: string;
  rows: { key: string; name: string; detail: string }[];
}) {
  return (
    <ul className="dg-cc-changes" aria-label={label}>
      {rows.map((row) => (
        <li key={row.key} className="dg-cc-change dg-cc-detail-line">
          <span className="font-semibold">{row.name}</span>
          <span className="dg-tabular-nums"> {row.detail}</span>
        </li>
      ))}
    </ul>
  );
}

const WHY_ORDER = [
  "Recurring schedule",
  "Restored",
  "Moved back",
  "Up to their usual days",
  "Keeps days off together",
  "Prefers this shift",
  "Fewest weekends",
  "Fewest nights",
  "Fewest hours",
  "Even",
  "Only one free",
  "Qualified and free",
];

const CHOICE_WHY: Record<CoverageFairChoice["reason"], string> = {
  only: "Only one free",
  daysOff: "Keeps days off together",
  preference: "Prefers this shift",
  weekends: "Fewest weekends",
  nights: "Fewest nights",
  hours: "Fewest hours",
  tie: "Even",
  weekDays: "Up to their usual days",
};

/** Each person a build changed: shifts given and why, by name. */
export function buildReportPeople(
  preview: CoverageBuildPreview,
  words: Pick<SkippedWords, "personName">,
): { key: string; name: string; detail: string }[] {
  const people = new Map<
    string,
    { shifts: number; absences: number; daysOff: number; why: Set<string> }
  >();
  const personOf = (employeeId: string) => {
    const person = people.get(employeeId) ?? {
      shifts: 0,
      absences: 0,
      daysOff: 0,
      why: new Set<string>(),
    };
    people.set(employeeId, person);
    return person;
  };
  for (const recurring of preview.recurringPeople) {
    const person = personOf(recurring.employeeId);
    person.shifts += recurring.shifts;
    person.absences += recurring.absences;
    person.why.add("Recurring schedule");
  }
  for (const dayOff of preview.daysOff) personOf(dayOff.employeeId).daysOff += 1;
  const choiceOf = new Map(preview.choices.map((choice) => [choice.suggestionId, choice]));
  for (const fix of preview.fixes) {
    if (!fix.employeeId) continue;
    const person = personOf(fix.employeeId);
    person.shifts += 1;
    const choice = choiceOf.get(fix.id);
    person.why.add(
      fix.kind === "restore"
        ? "Restored"
        : fix.kind === "moveBack"
          ? "Moved back"
          : choice
            ? CHOICE_WHY[choice.reason]
            : "Qualified and free",
    );
  }
  return [...people.entries()]
    .map(([employeeId, person]) => ({
      key: employeeId,
      name: words.personName(employeeId),
      detail: [
        person.shifts > 0 ? pluralize(person.shifts, "shift", "shifts") : null,
        person.absences > 0 ? pluralize(person.absences, "absence", "absences") : null,
        person.daysOff > 0 ? pluralize(person.daysOff, "day off", "days off") : null,
        [...person.why].sort((a, b) => WHY_ORDER.indexOf(a) - WHY_ORDER.indexOf(b)).join(", "),
      ]
        .filter(Boolean)
        .join(" · "),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const LIST_SHOWN = 5;

/** The first five, then all of them on request. */
function useShowAll<T>(items: T[]): { shown: T[]; toggle: ReactNode } {
  const [showAll, setShowAll] = useState(false);
  return {
    shown: showAll ? items : items.slice(0, LIST_SHOWN),
    toggle:
      items.length > LIST_SHOWN ? (
        <button
          type="button"
          className="dg-cc-show-all"
          aria-expanded={showAll}
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </button>
      ) : null,
  };
}

function BuildReport({
  preview,
  words,
  onSelectCell,
  onDone,
}: {
  preview: CoverageBuildPreview;
  words: SkippedWords;
  onSelectCell?: (rowKey: string, dateKey: string) => void;
  onDone: () => void;
}) {
  const people = useShowAll(buildReportPeople(preview, words));
  const short = useShowAll(preview.shortCells);
  const over = overThresholdLines(preview.overThreshold, words);
  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="dg-cc-detail-line dg-tabular-nums font-semibold">
          Applied {pluralize(buildChangeCount(preview), "change", "changes")} for{" "}
          {pluralize(preview.people, "person", "people")}
        </p>
        <NameList label="What each person was given" rows={people.shown} />
        {people.toggle}
        {over.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="dg-cc-caption">Over {WEEKLY_OVERTIME_HOURS} hours a week</div>
            <NameList label={`Over ${WEEKLY_OVERTIME_HOURS} hours a week`} rows={over} />
          </div>
        )}
        <SixthDays preview={preview} words={words} />
        <RecurringSkipped entries={preview.recurringSkipped} words={words} />
        {preview.shortCells.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="dg-cc-caption dg-tabular-nums">
              Still short: {pluralize(preview.shortCells.length, "shift", "shifts")}
            </div>
            <ul className="dg-cc-changes" aria-label="Still short">
              {short.shown.map((cell) => (
                <li key={`${cell.rowKey}|${cell.dateKey}`} className="dg-cc-change">
                  <button
                    type="button"
                    className="dg-cc-show-all dg-tabular-nums"
                    onClick={() => onSelectCell?.(cell.rowKey, cell.dateKey)}
                  >
                    {words.rowLabel(cell.rowKey)}, {words.formatDate(cell.dateKey)}:{" "}
                    {formatCoverageNumber(cell.staffShort)} short
                  </button>
                </li>
              ))}
            </ul>
            {short.toggle}
          </div>
        )}
      </div>
      <Button type="button" className="dg-btn dg-btn-secondary" onClick={onDone}>
        Done
      </Button>
    </>
  );
}

/** Who could not take the shifts left short: a count, with the reasons on request. */
function SkippedList({ people }: { people: SkippedPerson[] }) {
  const [open, setOpen] = useState(false);
  const list = useShowAll(people);
  if (people.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        className="dg-cc-show-all"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open
          ? "Hide who couldn't be scheduled"
          : `${pluralize(people.length, "person", "people")} couldn't be scheduled`}
      </button>
      {open && (
        <>
          <NameList
            label="Not scheduled"
            rows={list.shown.map((person) => ({
              key: person.employeeId,
              name: person.name,
              detail: person.lines.join("; "),
            }))}
          />
          {list.toggle}
        </>
      )}
    </div>
  );
}

interface ScheduleBuildSectionProps {
  /** What the build covers, such as "All focus areas, Oct 18 - 31". */
  scope: string;
  state: ScheduleBuildState;
  /** Another change is being applied; nothing may start meanwhile. */
  busy: boolean;
  onPreview: () => void;
  onBuild: () => void;
  onCancel: () => void;
  /** Words for the people a build names; without them those lists are left out. */
  skippedWords?: SkippedWords;
  /** Selects a still-short shift's cell in the matrix. */
  onSelectCell?: (rowKey: string, dateKey: string) => void;
  /** Whether a build may give someone a sixth day in a row; the option is left out without a handler. */
  allowSixthDay?: boolean;
  onAllowSixthDayChange?: (allow: boolean) => void;
}

export const BUILD_SUMMARY = `Fills open shifts with qualified staff who are free, starting from recurring schedules, then gives anyone scheduled fewer than ${MAX_DAYS_IN_A_WEEK} days a week (or their recurring schedule's days) more shifts where staff are thinnest, even if that staffs a shift above what it needs. Nobody works more than ${MAX_DAYS_IN_A_WEEK} days a week or ${MAX_DAYS_IN_A_ROW} in a row, days off stay together, and everyone stays within ${WEEKLY_OVERTIME_HOURS} hours a week when it can. Weekends and nights are shared fairly. Never moves anyone already scheduled or gives anyone two shifts in a day.`;

/** Everything a build writes: recurring fills and fixes. */
export function buildChangeCount(preview: CoverageBuildPreview): number {
  return (
    preview.recurring.shifts +
    preview.recurring.absences +
    preview.fixes.length +
    preview.daysOff.length
  );
}

/** "4 recurring shifts · 11 new shifts · 1 restored", or null when there is only one kind. */
export function buildBreakdown(preview: CoverageBuildPreview): string | null {
  const { shifts, absences } = preview.recurring;
  const { assign, restore, moveBack } = preview.counts;
  const parts = [
    shifts > 0 ? pluralize(shifts, "recurring shift", "recurring shifts") : null,
    absences > 0 ? pluralize(absences, "recurring absence", "recurring absences") : null,
    assign > 0 ? pluralize(assign, "new shift", "new shifts") : null,
    restore > 0 ? `${formatCoverageNumber(restore)} restored` : null,
    moveBack > 0 ? `${formatCoverageNumber(moveBack)} moved back` : null,
    preview.daysOff.length > 0 ? pluralize(preview.daysOff.length, "day off", "days off") : null,
  ].filter((part): part is string => part != null);
  return parts.length > 1 ? parts.join(" · ") : null;
}

/** One "now → after" pair, read aloud as "9 now, 7 after". */
function BeforeAfter({ label, before, after }: { label: string; before: number; after: number }) {
  const text = `${formatCoverageNumber(before)} now, ${formatCoverageNumber(after)} after`;
  return (
    <div>
      <dt>{label}</dt>
      <dd aria-label={text}>
        {formatCoverageNumber(before)} → {formatCoverageNumber(after)}
      </dd>
    </div>
  );
}

function PreviewSummary({
  preview,
  skippedWords,
}: {
  preview: CoverageBuildPreview;
  skippedWords?: SkippedWords;
}) {
  const breakdown = buildBreakdown(preview);
  const over = skippedWords ? overThresholdLines(preview.overThreshold, skippedWords) : [];
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="dg-cc-detail-line dg-tabular-nums font-semibold">
          {pluralize(buildChangeCount(preview), "change", "changes")} for{" "}
          {pluralize(preview.people, "person", "people")}
        </p>
        {breakdown && (
          <p className="dg-cc-detail-line dg-cc-detail-line--muted dg-tabular-nums">{breakdown}</p>
        )}
      </div>
      <dl className="dg-cc-build-counts dg-tabular-nums">
        <BeforeAfter label="Short shifts" before={preview.shortBefore} after={preview.shortAfter} />
        <BeforeAfter
          label="Staff short"
          before={preview.staffShortBefore}
          after={preview.staffShortAfter}
        />
        {(preview.overBefore > 0 || preview.overAfter > 0) && (
          <BeforeAfter label="Over" before={preview.overBefore} after={preview.overAfter} />
        )}
      </dl>
      {over.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="dg-cc-caption">Over {WEEKLY_OVERTIME_HOURS} hours a week</div>
          <NameList label={`Over ${WEEKLY_OVERTIME_HOURS} hours a week`} rows={over} />
        </div>
      )}
      {skippedWords && <SixthDays preview={preview} words={skippedWords} />}
      {skippedWords && <RecurringSkipped entries={preview.recurringSkipped} words={skippedWords} />}
      {skippedWords?.dayOffName === null && (
        <p className="dg-cc-detail-line dg-cc-detail-line--muted">
          No day off absence is set, so empty days stay empty. Choose one in Settings &gt; Schedule
          Rules.
        </p>
      )}
      {preview.shortAfter > 0 && (!skippedWords || preview.skipped.length === 0) && (
        <p className="dg-cc-detail-line dg-cc-detail-line--muted">
          Nobody qualified is free for the shifts left short. Select one to see why.
        </p>
      )}
      {skippedWords && <SkippedList people={groupSkipped(preview.skipped, skippedWords)} />}
    </div>
  );
}

/** Share of the open spots filled so far, 0 to 100; 0 before planning starts. */
export function planningPercent(progress: CoverageBuildProgress | null): number {
  if (!progress) return 0;
  return progress.needed > 0 ? Math.round((progress.filled / progress.needed) * 100) : 100;
}

/** What a build is doing right now, with a bar and its percentage. */
function BuildProgress({ label, percent }: { label: string; percent: number }) {
  const shown = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="dg-cc-build-progress dg-tabular-nums" role="status" aria-live="polite">
        <Loader aria-hidden className="animate-spin shrink-0" size={14} />
        <span className="min-w-0 flex-1">{label}</span>
        <span>{shown}%</span>
      </div>
      <div
        className="dg-cc-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
      >
        <div className="dg-cc-progress-bar" style={{ width: `${shown}%` }} />
      </div>
    </div>
  );
}

/** The Schedule Builder's top part: what a build does, its preview, and Build. */
export function ScheduleBuildSection({
  scope,
  state,
  busy,
  onPreview,
  onBuild,
  onCancel,
  skippedWords,
  onSelectCell,
  allowSixthDay = false,
  onAllowSixthDayChange,
}: ScheduleBuildSectionProps) {
  const previewing = state.status === "previewing";
  return (
    <section className="dg-cc-detail" aria-label="Auto-build">
      <div className="min-w-0">
        <h3 className="dg-cc-detail-title">Auto-build</h3>
        <div className="dg-cc-detail-date dg-tabular-nums">{scope}</div>
      </div>

      {state.status === "built" && skippedWords ? (
        <BuildReport
          preview={state.preview}
          words={skippedWords}
          onSelectCell={onSelectCell}
          onDone={onCancel}
        />
      ) : state.status === "applying" ? (
        <>
          <PreviewSummary preview={state.preview} />
          {state.saved == null ? (
            <BuildProgress
              label="Checking the plan against the latest schedule"
              percent={planningPercent(state.checking)}
            />
          ) : (
            <BuildProgress
              label={`Saving changes: ${state.saved} of ${state.total}`}
              percent={state.total > 0 ? (state.saved / state.total) * 100 : 100}
            />
          )}
        </>
      ) : state.status === "ready" ? (
        buildChangeCount(state.preview) > 0 ? (
          <>
            <PreviewSummary preview={state.preview} skippedWords={skippedWords} />
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                className="dg-btn dg-btn-secondary"
                onClick={onCancel}
                disabled={busy}
              >
                Discard
              </Button>
              <Button
                type="button"
                className="dg-btn dg-btn-primary"
                onClick={onBuild}
                disabled={busy}
              >
                Apply
              </Button>
            </div>
            <p className="dg-cc-detail-line dg-cc-detail-line--muted">
              Changes the draft only; Undo puts it all back.
            </p>
          </>
        ) : (
          <>
            <p className="dg-cc-detail-line dg-tabular-nums">
              {state.preview.shortBefore > 0
                ? `Nothing to fill. Nobody qualified is free for the ${pluralize(
                    state.preview.shortBefore,
                    "short shift",
                    "short shifts",
                  )}.`
                : "Nothing to fill. Every shift here is staffed."}
            </p>
            {skippedWords && (
              <SkippedList people={groupSkipped(state.preview.skipped, skippedWords)} />
            )}
            <Button type="button" className="dg-btn dg-btn-secondary" onClick={onCancel}>
              Done
            </Button>
          </>
        )
      ) : (
        <>
          <p className="dg-cc-detail-line dg-cc-detail-line--muted">{BUILD_SUMMARY}</p>
          {onAllowSixthDayChange && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="dg-cc-detail-line">Allow 6 days in a week</span>
                <Switch
                  checked={allowSixthDay}
                  onChange={onAllowSixthDayChange}
                  ariaLabel="Allow 6 days in a week"
                  disabled={previewing}
                />
              </div>
              {allowSixthDay && (
                <p className="dg-cc-detail-line dg-cc-build-warning" role="note">
                  Some people may work {MAX_DAYS_IN_A_WEEK_STRETCHED} days in a week or{" "}
                  {MAX_DAYS_IN_A_ROW_STRETCHED} in a row, never {MAX_DAYS_IN_A_WEEK_STRETCHED + 1}.
                  The result names everyone who does.
                </p>
              )}
            </div>
          )}
          {state.status === "previewing" && (
            <BuildProgress
              label={
                state.progress == null
                  ? "Loading recurring schedules and recent weeks"
                  : `Placing shifts: ${state.progress.placed} placed`
              }
              percent={planningPercent(state.progress)}
            />
          )}
          {state.status === "failed" && (
            <p className="dg-cc-detail-line" role="alert">
              The schedule couldn&apos;t be generated. Try again.
            </p>
          )}
          <Button
            type="button"
            className="dg-btn dg-btn-primary"
            onClick={onPreview}
            disabled={busy || previewing}
          >
            <ButtonLoading loading={previewing} spinnerSize={14}>
              Generate schedule
            </ButtonLoading>
          </Button>
        </>
      )}
    </section>
  );
}
