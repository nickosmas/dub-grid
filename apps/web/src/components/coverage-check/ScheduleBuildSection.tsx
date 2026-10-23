"use client";

import { useState } from "react";
import {
  WEEKLY_OVERTIME_HOURS,
  formatLocalDateKey,
  parseLocalDateKey,
  type CoverageBuildPreview,
  type CoverageOverThreshold,
  type CoverageRuledOut,
} from "@dubgrid/schedule-core";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { formatCoverageNumber, pluralize } from "./coverage-check-text";

export type ScheduleBuildState =
  | { status: "idle" }
  | { status: "previewing" }
  | { status: "failed" }
  | { status: "ready"; preview: CoverageBuildPreview };

/** Words for the people a build names, from the page's own lookups. */
export interface SkippedWords {
  personName: (employeeId: string) => string;
  formatDate: (dateKey: string) => string;
  reason: (entry: CoverageRuledOut) => string;
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

const SKIPPED_SHOWN = 5;

/** Who could not take the shifts left short: a count, with the reasons on request. */
function SkippedList({ people }: { people: SkippedPerson[] }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  if (people.length === 0) return null;
  const shown = showAll ? people : people.slice(0, SKIPPED_SHOWN);
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
            rows={shown.map((person) => ({
              key: person.employeeId,
              name: person.name,
              detail: person.lines.join("; "),
            }))}
          />
          {people.length > SKIPPED_SHOWN && (
            <button
              type="button"
              className="dg-cc-show-all"
              aria-expanded={showAll}
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? "Show fewer" : `Show all ${people.length}`}
            </button>
          )}
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
}

export const BUILD_SUMMARY = `Fills empty cells from recurring schedules, then short shifts with qualified people who are free, keeping each person within ${WEEKLY_OVERTIME_HOURS} hours a week when it can and sharing weekends, nights and hours evenly. It never changes anyone already scheduled.`;

/** Everything a build writes: recurring fills and fixes. */
export function buildChangeCount(preview: CoverageBuildPreview): number {
  return preview.recurring.shifts + preview.recurring.absences + preview.fixes.length;
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
      {preview.shortAfter > 0 && (!skippedWords || preview.skipped.length === 0) && (
        <p className="dg-cc-detail-line dg-cc-detail-line--muted">
          Nobody qualified is free for the shifts left short. Select one to see why.
        </p>
      )}
      {skippedWords && <SkippedList people={groupSkipped(preview.skipped, skippedWords)} />}
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
}: ScheduleBuildSectionProps) {
  const previewing = state.status === "previewing";
  return (
    <section className="dg-cc-detail" aria-label="Build the draft">
      <div className="min-w-0">
        <h3 className="dg-cc-detail-title">Build the draft</h3>
        <div className="dg-cc-detail-date dg-tabular-nums">{scope}</div>
      </div>

      {state.status === "ready" ? (
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
                Cancel
              </Button>
              <Button
                type="button"
                className="dg-btn dg-btn-primary"
                onClick={onBuild}
                disabled={busy}
              >
                Build
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
                ? `Nothing to build. Nobody qualified is free for the ${pluralize(
                    state.preview.shortBefore,
                    "short shift",
                    "short shifts",
                  )}.`
                : "Nothing to build. Every shift here is staffed."}
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
          {state.status === "failed" && (
            <p className="dg-cc-detail-line" role="alert">
              The build couldn&apos;t be worked out. Try again.
            </p>
          )}
          <Button
            type="button"
            className="dg-btn dg-btn-primary"
            onClick={onPreview}
            disabled={busy || previewing}
          >
            <ButtonLoading loading={previewing} spinnerSize={14}>
              Preview build
            </ButtonLoading>
          </Button>
        </>
      )}
    </section>
  );
}
