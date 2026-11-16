import type { CSSProperties } from "react";

import { PRINT_FIT_LINE } from "@/components/print-fit";
import { MentoredGlyph } from "@/components/schedule-grid/MentoredGlyph";
import { PRINT_INK } from "@/components/print-palette";
import { seamBorders, seamRadius, type PillSeam } from "@/lib/attached-pill";
import { fmt12hShort } from "@/lib/utils";

export interface PrintPillWing {
  initials: string;
  background: string;
  color: string;
}

export interface PrintShiftPillProps {
  primaryLabel: string;
  secondaryLabel?: string | null;
  time?: { start: string; end: string } | null;
  /** A time already written out, such as an absence's "Fri 3–7" (item 50d). */
  timeLabel?: string | null;
  background: string;
  color: string;
  border: string;
  /** The other focus area's initials, for a shift worked outside this section. */
  wing?: PrintPillWing | null;
  variant: "single" | "multi";
  isNameMode: boolean;
  /** The grid's mentored M, in the pill's corner. */
  mentored?: boolean;
  /** The cell's schedule notes, as the grid's dots in the pill's bottom-right corner. */
  notes?: readonly PrintNoteDot[];
  /** Edges where this pill touches its neighbour, which drop their border and rounding. */
  seams?: readonly PillSeam[];
  /** Space before this pill when it does not touch the one before it. */
  spacing?: CSSProperties;
}

export interface PrintNoteDot {
  id: number;
  name: string;
  color: string;
}

// Two dots and then a count, as on the grid.
const PRINT_VISIBLE_NOTE_DOTS = 2;

// The print window has no app CSS variables, so the corners are literal, in em
// so they scale with the chosen print size: the grid's 8px and 6px against
// its 14px names.
export const PRINT_PILL_RADIUS = { single: "0.55em", multi: "0.4em" } as const;

// The grid's code line: the job at three quarters of the code's size (12px
// beside 16px), after a half-faded dot with 2px either side, at 78% ink.
export const PRINT_CODE_SEPARATOR = (codeSize: string): CSSProperties => ({
  fontSize: `calc(${codeSize} * 0.75)`,
  fontWeight: 700,
  opacity: 0.5,
  margin: "0 0.167em",
});
export const PRINT_CODE_JOB = (codeSize: string): CSSProperties => ({
  fontSize: `calc(${codeSize} * 0.75)`,
  fontWeight: 700,
  opacity: 0.78,
});

// A line that shrinks to fit rather than being cut off (see print-fit.ts).
const FIT_LINE: CSSProperties = { ...PRINT_FIT_LINE, textAlign: "center" };

// Spelled-out names wrap, but only between words; a word too long for the
// pill shrinks instead of breaking.
const FIT_WORDS: CSSProperties = { ...FIT_LINE, whiteSpace: "normal" };

/**
 * One printed shift, drawn as the grid draws it. The focus-area wing is a
 * flex item rather than an overlay, so a label can never run underneath it.
 */
export function PrintShiftPill({
  primaryLabel,
  secondaryLabel,
  time,
  timeLabel,
  background,
  color,
  border,
  wing,
  variant,
  isNameMode,
  mentored = false,
  notes = [],
  seams = [],
  spacing,
}: PrintShiftPillProps) {
  const isMulti = variant === "multi";
  const hasTime = !!timeLabel || (!!time && !!(time.start || time.end));
  const hasSecondary = !!secondaryLabel;
  const primarySize = isNameMode ? (isMulti ? "0.82em" : "0.9em") : isMulti ? "0.95em" : "1.05em";
  const detailSize = isMulti ? "0.7em" : "0.76em";

  return (
    <div
      data-print-pill={variant}
      style={{
        flex: 1,
        minWidth: 0,
        position: "relative",
        display: "flex",
        flexDirection: "row",
        background,
        color,
        ...seamBorders(border, seams),
        borderRadius: seamRadius(PRINT_PILL_RADIUS[variant], seams),
        overflow: "hidden",
        ...spacing,
      }}
    >
      {wing && (
        <span
          data-print-pill-wing="side"
          style={{
            // Initials stack upright, as on the grid, so the wing costs one
            // letter of width; upright glyphs advance about 1.2em, hence the
            // negative spacing.
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            writingMode: "vertical-rl",
            textOrientation: "upright",
            whiteSpace: "nowrap",
            background: wing.background,
            color: wing.color,
            fontSize: "0.68em",
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: "-0.2em",
            padding: "0 0.2em",
          }}
        >
          {wing.initials}
        </span>
      )}
      {mentored && (
        <span
          data-print-mentored=""
          aria-label="Mentored assignment"
          style={{
            position: "absolute",
            // The note dots' inset (0.15em of the pill's type) in this badge's
            // own smaller em, so both corners sit the same distance in.
            top: "0.25em",
            right: "0.25em",
            width: "1.75em",
            height: "1.75em",
            borderRadius: 999,
            background: PRINT_INK.surface,
            border: `1px solid ${PRINT_INK.border}`,
            color: PRINT_INK.text,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.6em",
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          <MentoredGlyph size="1.1em" />
        </span>
      )}
      {notes.length > 0 && (
        <span
          data-print-indicators="true"
          aria-label={`Schedule notes: ${notes.map((note) => note.name).join(", ")}`}
          style={{
            position: "absolute",
            right: "0.15em",
            bottom: "0.15em",
            display: "flex",
            alignItems: "center",
            gap: "0.15em",
          }}
        >
          {notes.slice(0, PRINT_VISIBLE_NOTE_DOTS).map((note) => (
            <span
              key={note.id}
              data-print-note-dot={note.id}
              style={{
                width: "0.55em",
                height: "0.55em",
                borderRadius: "50%",
                background: note.color,
                // Rimmed in the pill's text colour, so a note the shift's own
                // colour still shows.
                boxShadow: `inset 0 0 0 1px ${color}`,
                flexShrink: 0,
              }}
            />
          ))}
          {notes.length > PRINT_VISIBLE_NOTE_DOTS && (
            <span
              data-print-note-more={notes.length - PRINT_VISIBLE_NOTE_DOTS}
              style={{ fontSize: "0.55em", fontWeight: 700, lineHeight: 1, color }}
            >
              +{notes.length - PRINT_VISIBLE_NOTE_DOTS}
            </span>
          )}
        </span>
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          justifyContent: "center",
          gap: "0.1em",
          // Room on both sides for the M in the corner keeps the label centred.
          padding: mentored ? "0.2em 1.05em" : isNameMode ? "0.2em 0.3em" : "0.2em 0.2em",
          // Room under the label for the notes in the bottom-right corner.
          ...(notes.length > 0 ? { paddingBottom: "0.75em" } : null),
          lineHeight: 1.15,
        }}
      >
        {isNameMode ? (
          <>
            <span data-print-fit="" style={FIT_WORDS}>
              <span style={{ fontSize: primarySize, fontWeight: 600 }}>{primaryLabel}</span>
            </span>
            {hasSecondary && (
              <span data-print-fit="" style={FIT_LINE}>
                <span style={{ fontSize: detailSize, fontWeight: 600, opacity: 0.78 }}>
                  {secondaryLabel}
                </span>
              </span>
            )}
          </>
        ) : (
          <span data-print-fit="" style={FIT_LINE}>
            <span style={{ fontSize: primarySize, fontWeight: 600 }}>{primaryLabel}</span>
            {hasSecondary && (
              <>
                <span aria-hidden="true" style={PRINT_CODE_SEPARATOR(primarySize)}>
                  ·
                </span>
                <span style={PRINT_CODE_JOB(primarySize)}>{secondaryLabel}</span>
              </>
            )}
          </span>
        )}
        {hasTime && (
          <span data-print-fit="" style={FIT_LINE}>
            <span
              style={{
                fontSize: detailSize,
                fontWeight: 500,
                opacity: 0.75,
                letterSpacing: "0.01em",
              }}
            >
              {timeLabel ?? `${fmt12hShort(time!.start)} - ${fmt12hShort(time!.end)}`}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
