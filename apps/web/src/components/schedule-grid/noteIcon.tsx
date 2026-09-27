import { StickyNote } from "lucide-react";
import type { ScheduleNoteMarkState } from "./noteDots";

/**
 * A schedule note as a sticky note in the note's colour, for every place with
 * room beside the name; grid cells keep their dots. A draft addition is faded
 * and a removal is a dashed outline. Colours are literal, so print can use it.
 */
export function ScheduleNoteIcon({
  color,
  state = "published",
  size = 14,
}: {
  color: string;
  state?: ScheduleNoteMarkState;
  size?: number | string;
}) {
  const removed = state === "draft_removed" || state === "published_removed";
  return (
    <StickyNote
      aria-hidden="true"
      data-note-icon={state}
      size={size}
      strokeWidth={removed ? 2 : 1.75}
      style={{ flexShrink: 0, opacity: state === "draft_added" ? 0.5 : 1 }}
      {...(removed
        ? { fill: "none", stroke: color, strokeDasharray: "3 2" }
        : // The white stroke draws the fold as a crease on the coloured fill.
          { fill: color, stroke: "rgba(255,255,255,0.9)" })}
    />
  );
}
