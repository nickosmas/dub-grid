import { getPublishDiffTone } from "@/components/schedule-grid/publishDiffPill";

export interface ChangeCounts {
  newShifts?: number;
  modifiedShifts?: number;
  deletedShifts?: number;
  notes?: number;
}

/**
 * The counts in a draft/publish banner, doubling as the key for the grid.
 *
 * These used to be two separate things sitting side by side — a set of counts
 * and a Key listing New/Edited/Deleted — which meant reading the color of a
 * word to understand the color of a number right next to it, and a key for
 * "Deleted" over a schedule with nothing deleted. Each chip now carries the
 * grid's own tone for its kind, so a kind is named, counted and color-keyed
 * once, and only the kinds actually present appear.
 */
export default function ChangeCountChips({ counts }: { counts: ChangeCounts }) {
  const chips: { key: string; label: string; cls: string; tone?: string }[] = [];

  if (counts.newShifts)
    chips.push({
      key: "new",
      label: `${counts.newShifts} new`,
      cls: "dg-draft-chip--new",
      tone: getPublishDiffTone("new").background,
    });
  if (counts.modifiedShifts)
    chips.push({
      key: "modified",
      label: `${counts.modifiedShifts} edited`,
      cls: "dg-draft-chip--modified",
      tone: getPublishDiffTone("modified").background,
    });
  if (counts.deletedShifts)
    chips.push({
      key: "deleted",
      label: `${counts.deletedShifts} deleted`,
      cls: "dg-draft-chip--deleted",
      tone: getPublishDiffTone("deleted").background,
    });
  // Notes carry no grid tone — nothing about a cell changes color for them —
  // so their chip is a count only.
  if (counts.notes)
    chips.push({
      key: "notes",
      label: `${counts.notes} note${counts.notes !== 1 ? "s" : ""}`,
      cls: "dg-draft-chip--notes",
    });

  if (chips.length === 0) return null;

  return (
    <span
      aria-label="Change counts and color key"
      data-change-legend="true"
      style={{
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
        flexWrap: "wrap",
        minWidth: 0,
      }}
    >
      {chips.map((chip) => (
        <span key={chip.key} className={`dg-draft-chip ${chip.cls}`}>
          {chip.tone && (
            <span
              aria-hidden="true"
              data-change-legend-dot={chip.key}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: chip.tone,
                boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.75), 0 0 0 2px rgba(0, 0, 0, 0.08)",
                flexShrink: 0,
              }}
            />
          )}
          {chip.label}
        </span>
      ))}
    </span>
  );
}
