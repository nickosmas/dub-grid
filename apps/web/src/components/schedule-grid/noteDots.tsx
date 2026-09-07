import type { CSSProperties } from "react";
import { MaybeHint } from "@/components/ui/hint";
import type { IndicatorType } from "@/types";
import { NOTE_DOT_GAP, NOTE_DOT_SIZE } from "./badges";
import { getPublishDiffTone } from "./publishDiffPill";

/**
 * What a cell's note dot is saying about itself.
 *
 * A note lives outside the schedule-cell snapshot, so nothing else in the cell
 * changes when one is added or removed, and the dot has to carry its own state or
 * an unpublished note is indistinguishable from a published one.
 */
export type ScheduleNoteMarkState =
  "published" | "draft_added" | "draft_removed" | "published_added" | "published_removed";

export interface ScheduleNoteMark {
  indicatorTypeId: number;
  state: ScheduleNoteMarkState;
  /** Only a removed note carries these: its `schedule_notes` row is gone. */
  name?: string;
  color?: string;
}

function dotStyle(state: ScheduleNoteMarkState, color: string): CSSProperties {
  const base: CSSProperties = {
    width: NOTE_DOT_SIZE,
    height: NOTE_DOT_SIZE,
    borderRadius: "50%",
    flexShrink: 0,
    boxSizing: "border-box",
  };

  switch (state) {
    case "draft_added":
      return {
        ...base,
        background: color,
        border: "1.5px dashed rgba(255,255,255,0.95)",
        boxShadow: `0 0 0 1px ${color}`,
      };
    case "draft_removed":
      return {
        ...base,
        background: "transparent",
        border: `1.5px dashed ${color}`,
        boxShadow: "0 0 0 1px rgba(255,255,255,0.75)",
      };
    case "published_added":
      return {
        ...base,
        background: color,
        border: "1.5px solid rgba(255,255,255,0.9)",
        boxShadow: `0 0 0 1.5px ${getPublishDiffTone("new").background}`,
      };
    case "published_removed":
      return {
        ...base,
        background: "transparent",
        border: `1.5px dashed ${color}`,
        boxShadow: `0 0 0 1.5px ${getPublishDiffTone("deleted").background}`,
      };
    default:
      return {
        ...base,
        background: color,
        border: "1.5px solid rgba(255,255,255,0.9)",
      };
  }
}

const STATE_SUFFIX: Record<ScheduleNoteMarkState, string> = {
  published: "",
  draft_added: " · Added, not published",
  draft_removed: " · Removed, not published",
  published_added: " · Added in the last publish",
  published_removed: " · Removed in the last publish",
};

/**
 * The note dots for one cell.
 *
 * One component for every place they appear. The four branches of the grid
 * cell each carried their own copy, which is how two of them ended up with
 * hardcoded sizes and how the deleted-shift branch once dropped notes entirely.
 */
export function NoteDots({
  marks,
  indicatorTypes,
  style,
}: {
  marks: ScheduleNoteMark[];
  indicatorTypes: IndicatorType[];
  /** Placement within the cell; each call site anchors its own corner. */
  style: CSSProperties;
}) {
  if (marks.length === 0) return null;

  return (
    <div
      data-note-dots="true"
      style={{ position: "absolute", display: "flex", gap: NOTE_DOT_GAP, ...style }}
    >
      {marks.map((mark) => {
        const indicator = indicatorTypes.find((type) => type.id === mark.indicatorTypeId);
        const name = indicator?.name ?? mark.name ?? "Note";
        const color = indicator?.color ?? mark.color ?? "var(--dg-color-text-muted)";
        const label = `${name}${STATE_SUFFIX[mark.state]}`;
        return (
          <MaybeHint key={`${mark.indicatorTypeId}_${mark.state}`} content={label} side="top">
            <div
              data-note-dot={mark.state}
              aria-label={label}
              style={dotStyle(mark.state, color)}
            />
          </MaybeHint>
        );
      })}
    </div>
  );
}
