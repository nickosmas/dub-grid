"use client";

import DraftReviewSummary from "@/components/DraftReviewSummary";
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

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * Body of the publish confirmation.
 *
 * Publishing commits every draft in the window, other editors' included, so the
 * dialog breaks the changes down per editor rather than only totalling them.
 * It mirrors the discard dialog's card layout, and reuses the same summary
 * component, so the two schedule-wide decisions read the same way.
 */
export function PublishChangeSummary({
  editorRows,
  activeEditors = [],
  windowLabel,
  totalChanges,
  coverageGapCount,
}: {
  editorRows: PublishEditorRow[];
  /** Other people on the schedule right now, drafts or not. */
  activeEditors?: PublishActiveEditor[];
  windowLabel: string;
  totalChanges: number;
  coverageGapCount: number;
}) {
  const otherEditors = editorRows.filter((row) => !row.isCurrentUser);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p
        style={{
          margin: 0,
          fontSize: "var(--dg-fs-body-sm)",
          lineHeight: 1.5,
          color: "var(--dg-color-text-secondary)",
        }}
      >
        {`Publish ${totalChanges} unpublished change${totalChanges === 1 ? "" : "s"} for ${windowLabel}?`}
        {otherEditors.length > 0
          ? " This includes drafts from other editors, not just your own."
          : ""}
      </p>

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
              emptyMessage="No unpublished changes."
            />
          ))}
        </div>
      )}

      {activeEditors.length > 0 && (
        <p
          style={{
            margin: 0,
            borderRadius: "var(--dg-radius-lg)",
            padding: "10px 12px",
            fontSize: "var(--dg-fs-footnote)",
            lineHeight: 1.5,
            background: "var(--dg-color-warning-bg)",
            color: "var(--dg-color-warning-text)",
          }}
        >
          {joinNames(activeEditors.map((editor) => editor.name))}{" "}
          {activeEditors.length === 1 ? "is" : "are"} on the schedule right now. Anything they have
          not saved yet will not be published.
        </p>
      )}

      {coverageGapCount > 0 && (
        <p
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-footnote)",
            lineHeight: 1.5,
            color: "var(--dg-color-text-secondary)",
          }}
        >
          {`${coverageGapCount} coverage gap${coverageGapCount === 1 ? "" : "s"} remain${
            coverageGapCount === 1 ? "s" : ""
          } in this period.`}
        </p>
      )}
    </div>
  );
}
