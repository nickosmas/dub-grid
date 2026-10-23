"use client";

import { useState } from "react";
import type { CoverageBuildPreview, CoverageRuledOut } from "@dubgrid/schedule-core";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { formatCoverageNumber, pluralize } from "./coverage-check-text";

export type ScheduleBuildState =
  | { status: "idle" }
  | { status: "previewing" }
  | { status: "failed" }
  | { status: "ready"; preview: CoverageBuildPreview };

/** Words for the people a build skipped, from the page's own lookups. */
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

const SKIPPED_SHOWN = 5;

function SkippedList({ people }: { people: SkippedPerson[] }) {
  const [showAll, setShowAll] = useState(false);
  if (people.length === 0) return null;
  const shown = showAll ? people : people.slice(0, SKIPPED_SHOWN);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="dg-cc-caption">Not scheduled</div>
      <ul className="dg-cc-changes" aria-label="Not scheduled">
        {shown.map((person) => (
          <li key={person.employeeId} className="dg-cc-change dg-cc-detail-line">
            <span className="font-semibold">{person.name}</span>
            <span className="dg-tabular-nums"> {person.lines.join("; ")}</span>
          </li>
        ))}
      </ul>
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
  /** Words for "Not scheduled"; without them the list is left out. */
  skippedWords?: SkippedWords;
}

const CONSIDERS = [
  "Starts from each person's recurring schedule, filling the empty cells it covers.",
  "Puts back shifts this draft removed or moved away.",
  "Then fills short shifts with people who are qualified and free at that time.",
  "Never moves or replaces anyone already scheduled.",
  "Never overrides an absence or a waiting request, and never approves a pickup.",
];

/** Everything a build writes: recurring fills and fixes. */
export function buildChangeCount(preview: CoverageBuildPreview): number {
  return preview.recurring.shifts + preview.recurring.absences + preview.fixes.length;
}

/** "From recurring schedules: 12 shifts, 2 absences", or null when it fills none. */
export function recurringLine(preview: CoverageBuildPreview): string | null {
  const { shifts, absences } = preview.recurring;
  if (shifts + absences === 0) return null;
  const parts = [
    shifts > 0 ? pluralize(shifts, "shift", "shifts") : null,
    absences > 0 ? pluralize(absences, "absence", "absences") : null,
  ].filter(Boolean);
  return `From recurring schedules: ${parts.join(", ")}.`;
}

/** "Schedules 14 shifts · Restores 1 shift", leaving out kinds it does not use. */
export function buildBreakdown(preview: CoverageBuildPreview): string {
  const { assign, restore, moveBack } = preview.counts;
  return [
    assign > 0 ? `Schedules ${pluralize(assign, "shift", "shifts")}` : null,
    restore > 0 ? `Restores ${pluralize(restore, "shift", "shifts")}` : null,
    moveBack > 0 ? `Moves back ${pluralize(moveBack, "shift", "shifts")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function PreviewSummary({
  preview,
  skippedWords,
}: {
  preview: CoverageBuildPreview;
  skippedWords?: SkippedWords;
}) {
  const showOver = preview.overBefore > 0 || preview.overAfter > 0;
  const recurring = recurringLine(preview);
  const breakdown = buildBreakdown(preview);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="dg-cc-detail-line dg-tabular-nums">
        <span className="font-semibold">
          {pluralize(buildChangeCount(preview), "change", "changes")} for{" "}
          {pluralize(preview.people, "person", "people")}.
        </span>
        {breakdown ? ` ${breakdown}.` : ""}
      </p>
      {recurring && <p className="dg-cc-detail-line dg-tabular-nums">{recurring}</p>}
      <dl className="dg-cc-build-counts dg-tabular-nums">
        <div>
          <dt>Short shifts</dt>
          <dd>
            {formatCoverageNumber(preview.shortBefore)} now,{" "}
            {formatCoverageNumber(preview.shortAfter)} after
          </dd>
        </div>
        <div>
          <dt>Staff short</dt>
          <dd>
            {formatCoverageNumber(preview.staffShortBefore)} now,{" "}
            {formatCoverageNumber(preview.staffShortAfter)} after
          </dd>
        </div>
        {showOver && (
          <div>
            <dt>Over</dt>
            <dd>
              {formatCoverageNumber(preview.overBefore)} now,{" "}
              {formatCoverageNumber(preview.overAfter)} after
            </dd>
          </div>
        )}
      </dl>
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
            <p className="dg-cc-detail-line dg-cc-detail-line--muted">
              Changes the draft only. Staff see it after you publish, and Undo puts it all back.
            </p>
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
          </>
        ) : (
          <>
            <p className="dg-cc-detail-line dg-tabular-nums">
              {state.preview.shortBefore > 0
                ? `Nothing to build. Nobody qualified is free for the ${pluralize(
                    state.preview.shortBefore,
                    "short shift",
                    "short shifts",
                  )}; select one to see why.`
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
          <ul className="dg-cc-sg-changes" aria-label="What a build does">
            {CONSIDERS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
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
