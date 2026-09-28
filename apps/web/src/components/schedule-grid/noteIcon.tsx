import { StickyNote } from "lucide-react";
import type { ScheduleNoteMarkState } from "./noteDots";

/**
 * A schedule note as a sticky note, for every place with room beside the
 * name; grid cells keep their dots. It takes the text colour, never the note's
 * own. A draft addition is faded. Print passes a
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
  return (
    <StickyNote
      aria-hidden="true"
      data-note-icon={state}
      size={size}
      fill="none"
      stroke={color}
      strokeWidth={2}
      style={{ flexShrink: 0, opacity: state === "draft_added" ? 0.5 : 1 }}
    />
  );
}
