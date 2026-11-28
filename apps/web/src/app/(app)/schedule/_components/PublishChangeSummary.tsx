"use client";

import { describeWorkLimit, type WorkLimitBreak } from "@dubgrid/schedule-core";
import DraftReviewSummary from "@/components/DraftReviewSummary";
import { Banner } from "@/components/ui/Banner";
import { UNATTRIBUTED_EDITOR_ID, type EditorDraftBreakdown } from "@/lib/publish-attribution";

export interface PublishEditorRow extends EditorDraftBreakdown {
  name: string | null;
  isOnline: boolean;
}

/** Someone on the schedule right now, whether or not they have drafts yet. */
export interface PublishActiveEditor {
  userId: string;
  name: string;
}

function editorLabel(row: PublishEditorRow): string {
  if (row.isCurrentUser) return "Your drafts";
  if (row.editorId === UNATTRIBUTED_EDITOR_ID) return "Unattributed drafts";
  // A name that never resolved still gets a card: the counts are real even
  // when the person cannot be identified.
  return row.name ?? "Another editor";
}

/**
 * Body of the publish confirmation.
 *
 * Publishing commits every draft in the window, other editors' included, so the
 * dialog breaks the changes down per editor rather than only totalling them.
 * It mirrors the discard dialog's card layout, and reuses the same summary
 * component, so the two schedule-wide decisions read the same way.
 */
/** What publishing does to coverage, counted on cells that have not started. */
export interface PublishCoverageChange {
  opened: number;
  closed: number;
  /** Some dates in the window were never published, so only the rest are compared. */
  partial: boolean;
}

export function publishCoverageChangeText(change: PublishCoverageChange): string {
  const where = change.partial ? " on dates already published" : "";
  if (change.opened === 0 && change.closed === 0) {
    return `This publish doesn't open or close any gap${where}.`;
  }
  const opens =
    change.opened === 0
      ? "opens no gaps"
      : `opens ${change.opened} ${change.opened === 1 ? "gap" : "gaps"}`;
  const closes = change.closed === 0 ? "closes none" : `closes ${change.closed}`;
  return `This publish ${opens} and ${closes}${where}.`;
}

/** Everyone a publish leaves over a work limit (60b). */
export interface PublishWorkLimitPerson {
  employeeId: string;
  breaks: WorkLimitBreak[];
}

/** "6 days in a row, Wed, Nov 25 to Mon, Nov 30", "42.5 hours in the week of Sun, Nov 29". */
export const workLimitText = describeWorkLimit;

/** One line per limit, in the order given: "Laura Marshall: 6 days in a row, ...". */
export function publishWorkLimitLines(
  people: ReadonlyArray<PublishWorkLimitPerson>,
  nameOf: (employeeId: string) => string,
): string[] {
  return people.flatMap(({ employeeId, breaks }) =>
    breaks.map((limit) => `${nameOf(employeeId)}: ${workLimitText(limit)}`),
  );
}

export function publishWorkLimitHeading(count: number): string {
  return count === 1
    ? "1 person will be over a work limit:"
    : `${count} people will be over a work limit:`;
}

export function PublishWorkLimits({
  people,
  nameOf,
}: {
  people: ReadonlyArray<PublishWorkLimitPerson>;
  nameOf: (employeeId: string) => string;
}) {
  if (people.length === 0) return null;
  return (
    <Banner
      tone="warning"
      role="status"
      aria-label="Work limits"
      title={publishWorkLimitHeading(people.length)}
    >
      {publishWorkLimitLines(people, nameOf).map((line) => (
        <span key={line}>{line}</span>
      ))}
    </Banner>
  );
}

/**
 * What publishing does. Two or more go in the dialog's summary box; a single
 * one reads as a sentence in the summary's message instead.
 */
export function publishSummaryPoints({
  editorRows,
  activeEditors = [],
  coverageGapCount,
  coverageChange = null,
}: {
  editorRows: PublishEditorRow[];
  /** Other people on the schedule right now, drafts or not. */
  activeEditors?: PublishActiveEditor[];
  coverageGapCount: number;
  /** Null when the organization has no coverage requirements. */
  coverageChange?: PublishCoverageChange | null;
}): string[] {
  const points: string[] = [];
  if (editorRows.some((row) => !row.isCurrentUser)) {
    points.push("Drafts from other editors are included, not just your own.");
  }
  if (activeEditors.length > 0) {
    points.push(
      activeEditors.length === 1
        ? "Anything the other editor on the schedule hasn't saved yet won't be published."
        : `Anything the ${activeEditors.length} other editors on the schedule haven't saved yet won't be published.`,
    );
  }
  if (coverageChange) points.push(publishCoverageChangeText(coverageChange));
  if (coverageGapCount > 0) {
    points.push(
      `${coverageGapCount} coverage gap${coverageGapCount === 1 ? "" : "s"} remain${
        coverageGapCount === 1 ? "s" : ""
      } in this period.`,
    );
  }
  return points;
}

export function PublishChangeSummary({
  editorRows,
  points = [],
  workLimits = [],
  nameOf = () => "Someone",
}: {
  editorRows: PublishEditorRow[];
  /** From `publishSummaryPoints`; only a lone point is written into the message. */
  points?: string[];
  /** Everyone the publish leaves over a work limit; listed, never blocking. */
  workLimits?: ReadonlyArray<PublishWorkLimitPerson>;
  nameOf?: (employeeId: string) => string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {points.length === 1 ? (
        <p
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-body-sm)",
            lineHeight: 1.5,
            color: "var(--dg-color-text-secondary)",
          }}
        >
          {points[0]}
        </p>
      ) : null}

      <PublishWorkLimits people={workLimits} nameOf={nameOf} />

      {editorRows.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              editorRows.length > 1 ? "repeat(auto-fit, minmax(220px, 1fr))" : "1fr",
            gap: 10,
          }}
        >
          {editorRows.map((row) => (
            <DraftReviewSummary
              key={row.editorId}
              title={editorLabel(row)}
              description={row.isOnline && !row.isCurrentUser ? "On the schedule now" : undefined}
              breakdown={row}
              emptyMessage="No unpublished changes"
            />
          ))}
        </div>
      )}
    </div>
  );
}
