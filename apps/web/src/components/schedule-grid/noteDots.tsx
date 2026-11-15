import type { CSSProperties } from "react";
import { MaybeHint } from "@/components/ui/hint";
import type { IndicatorType } from "@/types";
import {
  MAX_VISIBLE_NOTE_DOTS,
  NOTE_DOT_GAP,
  NOTE_DOT_SIZE,
  NOTE_LANE_HEIGHT,
  NOTE_LANE_INSET,
} from "./badges";
import { getPublishDiffTone } from "./publishDiffPill";

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

/** The marks a pill draws as dots, and how many more its count stands for. */
export function splitNoteMarks(
  marks: ScheduleNoteMark[],
  max: number = MAX_VISIBLE_NOTE_DOTS,
): { shown: ScheduleNoteMark[]; hidden: number } {
  return { shown: marks.slice(0, max), hidden: Math.max(0, marks.length - max) };
}

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

/**
 * One note's dot. Every ring is inset, so all three states are the same size.
 * A published dot is rimmed in the pill's text colour, so a note matching its
 * shift's colour still shows; a draft is hollow in its own colour, lightened on
 * dark pills; the last publish's additions take the publish "new" green.
 */
function noteDotStyle(
  state: ScheduleNoteMarkState,
  color: string,
  rim: string,
  isDark: boolean,
  size: number,
): CSSProperties {
  const ring = (width: number, ringColor: string) => `inset 0 0 0 ${width}px ${ringColor}`;
  const base: CSSProperties = {
    display: "block",
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
  };
  if (state === "draft_added") {
    return {
      ...base,
      background: "transparent",
      boxShadow: ring(1.75, isDark ? lighten(color, 0.4) : color),
    };
  }
  if (state === "published_added") {
    return {
      ...base,
      background: color,
      boxShadow: ring(1.75, getPublishDiffTone("new").background),
    };
  }
  return { ...base, background: color, boxShadow: ring(1, rim) };
}

/**
 * The room an `overlay` row of dots needs at the end of a pill, so its label
 * can stop short of them: the dots, their gaps, a "+N" when there is one, and
 * the corner inset on both sides.
 */
export function overlayNoteDotsWidth(count: number, dotSize: number): number {
  if (count === 0) return 0;
  const { shown, hidden } = splitNoteMarks(
    Array.from({ length: count }, () => ({ indicatorTypeId: 0, state: "published" as const })),
  );
  const gap = dotSize < NOTE_DOT_SIZE ? 2 : NOTE_DOT_GAP;
  const dots = shown.length * dotSize + (shown.length - 1) * gap;
  const more = hidden > 0 ? gap + Math.ceil(dotSize * 0.65 * (1 + String(hidden).length)) : 0;
  return dots + more + 2 * NOTE_LANE_INSET;
}

/** A schedule note's dot on its own, for a list that names each note beside it. */
export function NoteDot({
  color,
  state = "published",
  rimColor = "var(--dg-color-text)",
  isDark = false,
  size = NOTE_DOT_SIZE,
}: {
  color: string | undefined;
  state?: ScheduleNoteMarkState;
  rimColor?: string;
  isDark?: boolean;
  size?: number;
}) {
  return (
    <span
      data-note-mark={state}
      aria-hidden="true"
      style={noteDotStyle(state, color ?? "var(--dg-color-text-muted)", rimColor, isDark, size)}
    />
  );
}

const STATE_SUFFIX: Record<ScheduleNoteMarkState, string> = {
  published: "",
  draft_added: " · Added, not published",
  published_added: " · Added in the last publish",
};

/**
 * The note marks for one shift: a coloured dot per note in the pill's
 * bottom-right corner, up to two and then a count.
 *
 * One component for every place they appear. The four branches of the grid
 * cell each carried their own copy, which is how two of them ended up with
 * hardcoded sizes and how the deleted-shift branch once dropped notes entirely.
 */
export function NoteDots({
  marks,
  indicatorTypes,
  placement = "lane",
  rimColor = "var(--dg-color-text)",
  isDark = false,
  corner = false,
  dotSize = NOTE_DOT_SIZE,
  style,
}: {
  marks: ScheduleNoteMark[];
  indicatorTypes: IndicatorType[];
  /**
   * `lane` is a row of its own along the bottom of a flex-column pill, in flow
   * so the words leave room for it, the dots right-aligned in it; `overlay`
   * takes no room and sits in the bottom-right corner of the positioned pill
   * it is drawn in, for a pill too small for a lane (Month, phone width).
   */
  placement?: "lane" | "overlay";
  /** The pill's text colour, which rims a published dot and colours the count. */
  rimColor?: string;
  isDark?: boolean;
  /**
   * A grid pill's strip: the strip stays in flow as the room the words leave,
   * and the dots sit NOTE_LANE_INSET inside the pill's bottom-right corner, as
   * the mentored M sits in its top-right. The pill must be positioned.
   */
  corner?: boolean;
  dotSize?: number;
  style?: CSSProperties;
}) {
  if (marks.length === 0) return null;

  const typeOf = (mark: ScheduleNoteMark) =>
    indicatorTypes.find((type) => type.id === mark.indicatorTypeId);
  const labelOf = (mark: ScheduleNoteMark) =>
    `${typeOf(mark)?.name ?? "Note"}${STATE_SUFFIX[mark.state]}`;

  const label = marks.map(labelOf).join(", ");
  const { shown, hidden } = splitNoteMarks(marks);
  const overlay = placement === "overlay";
  const dots = (
    <MaybeHint content={label} side="top">
      <span
        role="img"
        data-note-dots={overlay ? "overlay" : undefined}
        aria-label={marks.length > 1 ? `${marks.length} notes: ${label}` : label}
        style={{
          display: "flex",
          alignItems: "center",
          gap: dotSize < NOTE_DOT_SIZE ? 2 : NOTE_DOT_GAP,
          ...(corner || overlay
            ? { position: "absolute", right: NOTE_LANE_INSET, bottom: NOTE_LANE_INSET }
            : null),
          ...(overlay ? style : null),
        }}
      >
        {shown.map((mark) => (
          <NoteDot
            key={`${mark.indicatorTypeId}_${mark.state}`}
            color={typeOf(mark)?.color}
            state={mark.state}
            rimColor={rimColor}
            isDark={isDark}
            size={dotSize}
          />
        ))}
        {hidden > 0 && (
          <span
            data-note-more={hidden}
            aria-hidden="true"
            className="dg-tabular-nums"
            style={{
              color: rimColor,
              // Sized to the dot row it ends, like the mentored M's label;
              // the smallest type token (12px) would outgrow a double shift's pill.
              fontSize: dotSize,
              fontWeight: 700,
              lineHeight: `${dotSize}px`,
            }}
          >
            +{hidden}
          </span>
        )}
      </span>
    </MaybeHint>
  );

  if (overlay) return dots;

  return (
    <div
      data-note-dots={placement}
      style={{
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        alignSelf: "stretch",
        height: NOTE_LANE_HEIGHT,
        justifyContent: "flex-end",
        ...style,
      }}
    >
      {dots}
    </div>
  );
}
