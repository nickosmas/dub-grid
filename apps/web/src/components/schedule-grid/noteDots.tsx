import type { CSSProperties } from "react";
import { MaybeHint } from "@/components/ui/hint";
import type { IndicatorType } from "@/types";
import { NOTE_ICON_SIZE, NOTE_STACK_SIZE } from "./badges";
import { ScheduleNoteIcon } from "./noteIcon";

/**
 * What a cell's note mark is saying about itself.
 *
 * A note lives outside the schedule-cell snapshot, so nothing else in the cell
 * changes when one is added or removed, and the mark has to carry its own state or
 * an unpublished note is indistinguishable from a published one.
 */
export type ScheduleNoteMarkState = "published" | "draft_added" | "published_added";

export interface ScheduleNoteMark {
  indicatorTypeId: number;
  state: ScheduleNoteMarkState;
}

// lucide's StickyNote, drawn by hand so two can be layered into one stack.
const NOTE_BODY =
  "M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z";
const NOTE_FOLD = "M15 3v5a1 1 0 0 0 1 1h5";

/** Mixes a hex colour toward white; anything else passes through. */
function lighten(color: string, amount: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const n = parseInt(match[1], 16);
  const channels = [n >> 16, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(c + (255 - c) * amount),
  );
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

interface GlyphColors {
  /** The pill's text colour: readable on the pill, so it outlines any note colour. */
  rim: string;
  isDark: boolean;
}

/**
 * One sticky note. A published note, the last publish's additions included, is
 * filled with the note's colour and outlined in the pill's text colour, so a
 * note matching its shift's colour still shows. A draft is hollow in its own
 * colour, lightened on dark pills.
 */
function NoteGlyph({
  state,
  color,
  colors,
  strokeWidth,
}: {
  state: ScheduleNoteMarkState;
  color: string;
  colors: GlyphColors;
  strokeWidth: number;
}) {
  if (state === "draft_added") {
    const line = colors.isDark ? lighten(color, 0.4) : color;
    return (
      <>
        <path d={NOTE_BODY} fill="none" stroke={line} strokeWidth={strokeWidth * 1.3} />
        <path d={NOTE_FOLD} fill="none" stroke={line} strokeWidth={strokeWidth} />
      </>
    );
  }
  return (
    <>
      <path d={NOTE_BODY} fill={color} stroke={colors.rim} strokeWidth={strokeWidth} />
      <path d={NOTE_FOLD} fill="none" stroke={colors.rim} strokeWidth={strokeWidth} />
    </>
  );
}

function CornerMark({
  marks,
  colorOf,
  colors,
  surface,
  label,
}: {
  marks: ScheduleNoteMark[];
  colorOf: (mark: ScheduleNoteMark) => string;
  colors: GlyphColors;
  surface: string;
  label: string;
}) {
  const [front, back] = marks;
  if (!back) {
    return (
      <svg
        data-note-mark={front.state}
        role="img"
        aria-label={label}
        width={NOTE_ICON_SIZE}
        height={NOTE_ICON_SIZE}
        viewBox="0 0 24 24"
        strokeLinejoin="round"
        style={{ display: "block", flexShrink: 0 }}
      >
        <NoteGlyph state={front.state} color={colorOf(front)} colors={colors} strokeWidth={2.6} />
      </svg>
    );
  }
  // The first note in front, the second behind it; a halo in the pill's own
  // colour keeps the two apart where they overlap.
  return (
    <svg
      data-note-mark="stack"
      role="img"
      aria-label={label}
      width={NOTE_STACK_SIZE}
      height={NOTE_STACK_SIZE}
      viewBox="0 0 24 24"
      strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0, overflow: "visible" }}
    >
      <g data-note-layer={back.state} transform="translate(6.5 -0.5) scale(0.74)">
        <NoteGlyph state={back.state} color={colorOf(back)} colors={colors} strokeWidth={3.2} />
      </g>
      <g data-note-layer={front.state} transform="translate(-0.5 6.5) scale(0.74)">
        <path d={NOTE_BODY} fill={surface} stroke={surface} strokeWidth={7.7} />
        <NoteGlyph state={front.state} color={colorOf(front)} colors={colors} strokeWidth={3.2} />
      </g>
    </svg>
  );
}

const STATE_SUFFIX: Record<ScheduleNoteMarkState, string> = {
  published: "",
  draft_added: " · Added, not published",
  published_added: " · Added in the last publish",
};

/**
 * The note marks for one shift: one coloured sticky note in a grid corner (a
 * stacked one for several notes), or a text-coloured icon per note inline
 * where there is room.
 *
 * One component for every place they appear. The four branches of the grid
 * cell each carried their own copy, which is how two of them ended up with
 * hardcoded sizes and how the deleted-shift branch once dropped notes entirely.
 */
export function NoteDots({
  marks,
  indicatorTypes,
  placement = "corner",
  rimColor = "var(--dg-color-text)",
  surfaceColor = "var(--dg-color-surface)",
  isDark = false,
  style,
}: {
  marks: ScheduleNoteMark[];
  indicatorTypes: IndicatorType[];
  /**
   * `corner` pins one mark inside a positioned cell, as the grid does; `inline`
   * lets an icon per note flow with a row's content where nothing is positioned.
   */
  placement?: "corner" | "inline";
  /** The pill's text colour, which outlines a corner mark. */
  rimColor?: string;
  /** The pill's fill, which separates a stack's two notes. */
  surfaceColor?: string;
  isDark?: boolean;
  /** Placement within the cell; each corner call site anchors its own corner. */
  style?: CSSProperties;
}) {
  if (marks.length === 0) return null;

  const typeOf = (mark: ScheduleNoteMark) =>
    indicatorTypes.find((type) => type.id === mark.indicatorTypeId);
  const labelOf = (mark: ScheduleNoteMark) =>
    `${typeOf(mark)?.name ?? "Note"}${STATE_SUFFIX[mark.state]}`;

  if (placement === "corner") {
    const label = marks.map(labelOf).join(", ");
    return (
      <div data-note-dots="true" style={{ position: "absolute", display: "flex", ...style }}>
        <MaybeHint content={label} side="top">
          <CornerMark
            marks={marks}
            colorOf={(mark) => typeOf(mark)?.color ?? "var(--dg-color-text-muted)"}
            colors={{ rim: rimColor, isDark }}
            surface={surfaceColor}
            label={marks.length > 1 ? `${marks.length} notes: ${label}` : label}
          />
        </MaybeHint>
      </div>
    );
  }

  return (
    <div data-note-dots="inline" style={{ flexShrink: 0, display: "flex", gap: 2, ...style }}>
      {marks.map((mark) => {
        const label = labelOf(mark);
        return (
          <MaybeHint key={`${mark.indicatorTypeId}_${mark.state}`} content={label} side="top">
            <span
              aria-label={label}
              role="img"
              style={{ display: "inline-flex", color: "var(--dg-color-text-muted)" }}
            >
              <ScheduleNoteIcon state={mark.state} />
            </span>
          </MaybeHint>
        );
      })}
    </div>
  );
}
