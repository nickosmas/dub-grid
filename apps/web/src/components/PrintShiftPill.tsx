import type { CSSProperties } from "react";

import { PRINT_FIT_LINE } from "@/components/print-fit";
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
  /** Edges where this pill touches its neighbour, which drop their border and rounding. */
  seams?: readonly PillSeam[];
  /** Space before this pill when it does not touch the one before it. */
  spacing?: CSSProperties;
}

// The print window has no app CSS variables, so the corners are literal, in em
// so they scale with the chosen print size: the grid's 8px and 6px against
// its 14px names.
export const PRINT_PILL_RADIUS = { single: "0.55em", multi: "0.4em" } as const;

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
            top: "0.12em",
            right: "0.12em",
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
          M
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
                <span
                  aria-hidden="true"
                  style={{ fontSize: detailSize, fontWeight: 700, margin: "0 0.12em" }}
                >
                  ·
                </span>
                <span style={{ fontSize: detailSize, fontWeight: 700, opacity: 0.78 }}>
                  {secondaryLabel}
                </span>
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
