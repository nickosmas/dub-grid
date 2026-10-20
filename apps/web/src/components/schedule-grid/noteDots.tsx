import type { CSSProperties, ReactNode } from "react";
import { MaybeHint } from "@/components/ui/hint";
import type { IndicatorType } from "@/types";
import {
  MAX_VISIBLE_NOTE_DOTS,
  NOTE_DOT_GAP,
  NOTE_DOT_SIZE,
  NOTE_LANE_HEIGHT,
  NOTE_LANE_INSET,
} from "./badges";
import { ScheduleNoteIcon } from "./noteIcon";
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
): CSSProperties {
  const ring = (width: number, ringColor: string) => `inset 0 0 0 ${width}px ${ringColor}`;
  const base: CSSProperties = {
    display: "block",
    width: NOTE_DOT_SIZE,
    height: NOTE_DOT_SIZE,
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

const STATE_SUFFIX: Record<ScheduleNoteMarkState, string> = {
  published: "",
  draft_added: " · Added, not published",
  published_added: " · Added in the last publish",
};

/**
 * The note marks for one shift: a coloured dot per note on a grid pill, up to
 * two and then a count, or a text-coloured icon per note inline where there is
 * room.
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
  style,
}: {
  marks: ScheduleNoteMark[];
  indicatorTypes: IndicatorType[];
  /**
   * Where a pill's dots go, always in flow so text makes room for them:
   * `lane` is a strip along the bottom of a flex-column pill, the dots
   * right-aligned in it; `line` ends a row of text that has no strip to spare.
   * `inline` lists an icon per note beside a name, outside the grid.
   */
  placement?: "lane" | "line" | "inline";
  /** The pill's text colour, which rims a published dot and colours the count. */
  rimColor?: string;
  isDark?: boolean;
  /**
   * A grid pill's strip: the strip stays in flow as the room the words leave,
   * and the dots sit NOTE_LANE_INSET inside the pill's bottom-right corner, as
   * the mentored M sits in its top-right. The pill must be positioned.
   */
  corner?: boolean;
  style?: CSSProperties;
}) {
  if (marks.length === 0) return null;

  const typeOf = (mark: ScheduleNoteMark) =>
    indicatorTypes.find((type) => type.id === mark.indicatorTypeId);
  const labelOf = (mark: ScheduleNoteMark) =>
    `${typeOf(mark)?.name ?? "Note"}${STATE_SUFFIX[mark.state]}`;

  if (placement !== "inline") {
    const label = marks.map(labelOf).join(", ");
    const { shown, hidden } = splitNoteMarks(marks);
    const placementStyle: CSSProperties =
      placement === "lane"
        ? {
            alignSelf: "stretch",
            height: NOTE_LANE_HEIGHT,
            justifyContent: "flex-end",
          }
        : {};
    return (
      <div
        data-note-dots={placement}
        style={{
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          ...placementStyle,
          ...style,
        }}
      >
        <MaybeHint content={label} side="top">
          <span
            role="img"
            aria-label={marks.length > 1 ? `${marks.length} notes: ${label}` : label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: NOTE_DOT_GAP,
              ...(corner
                ? { position: "absolute", right: NOTE_LANE_INSET, bottom: NOTE_LANE_INSET }
                : null),
            }}
          >
            {shown.map((mark) => (
              <span
                key={`${mark.indicatorTypeId}_${mark.state}`}
                data-note-mark={mark.state}
                aria-hidden="true"
                style={noteDotStyle(
                  mark.state,
                  typeOf(mark)?.color ?? "var(--dg-color-text-muted)",
                  rimColor,
                  isDark,
                )}
              />
            ))}
            {hidden > 0 && (
              <span
                data-note-more={hidden}
                aria-hidden="true"
                className="dg-tabular-nums"
                style={{
                  color: rimColor,
                  // Sized to the 9px dot row it ends, like the mentored M's label;
                  // the smallest type token (12px) would outgrow a double shift's pill.
                  fontSize: 9,
                  fontWeight: 700,
                  lineHeight: `${NOTE_DOT_SIZE}px`,
                }}
              >
                +{hidden}
              </span>
            )}
          </span>
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

/**
 * A line of pill text that ends with the pill's note dots, for a pill whose
 * second line leaves no room for a strip. Without dots the line is unchanged.
 */
export function NoteDotsLine({
  dots,
  style,
  children,
}: {
  dots: ReactNode;
  style?: CSSProperties;
  children: ReactNode;
}) {
  if (!dots) return <>{children}</>;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        maxWidth: "100%",
        minWidth: 0,
        ...style,
      }}
    >
      {children}
      {dots}
    </div>
  );
}
