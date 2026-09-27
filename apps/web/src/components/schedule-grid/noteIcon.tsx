import { StickyNote } from "lucide-react";
import type { ScheduleNoteMarkState } from "./noteDots";

/**
 * A schedule note as a sticky note, for every place with room beside the
 * name; grid cells keep their dots. It takes the text colour, never the note's
 * own. A draft addition is faded and a removal is dashed. Print passes a
 * literal colour, since the print window has none of the app's variables.
 */
export function ScheduleNoteIcon({
  color = "currentColor",
  state = "published",
  size = 14,
}: {
  color?: string;
  state?: ScheduleNoteMarkState;
  size?: number | string;
}) {
  const removed = state === "draft_removed" || state === "published_removed";
  return (
    <StickyNote
      aria-hidden="true"
      data-note-icon={state}
      size={size}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeDasharray={removed ? "3 2" : undefined}
      style={{ flexShrink: 0, opacity: state === "draft_added" ? 0.5 : 1 }}
    />
  );
}
