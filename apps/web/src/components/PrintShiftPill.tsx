import type { CSSProperties } from "react";

import { PRINT_FIT_LINE } from "@/components/print-fit";
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
  background: string;
  color: string;
  border: string;
  /** The other focus area's initials, for a shift worked outside this section. */
  wing?: PrintPillWing | null;
  variant: "single" | "multi";
  isNameMode: boolean;
  /** Puts the wing above the label, as a double shift's pills are too narrow for a side wing. */
  wingOnTop: boolean;
}

// The print window has no app CSS variables, so the corners are literal, in em
// so they scale with the chosen print size. Paper reads best with tighter
// corners than the grid's 8px and 6px.
const PILL_RADIUS = { single: "0.35em", multi: "0.3em" } as const;

// A line that shrinks to fit rather than being cut off (see print-fit.ts).
const FIT_LINE: CSSProperties = { ...PRINT_FIT_LINE, textAlign: "center" };

// Spelled-out names wrap, but only between words; a word too long for the
// pill shrinks instead of breaking.
const FIT_WORDS: CSSProperties = { ...FIT_LINE, whiteSpace: "normal" };

/**
 * One printed shift. The focus-area wing is a flex item rather than an
 * overlay, so a label can never run underneath it.
 */
export function PrintShiftPill({
  primaryLabel,
  secondaryLabel,
  time,
  background,
  color,
  border,
  wing,
  variant,
  isNameMode,
  wingOnTop,
}: PrintShiftPillProps) {
  const isMulti = variant === "multi";
  const hasTime = !!time && !!(time.start || time.end);
  const hasSecondary = !!secondaryLabel;
  const primarySize = isNameMode ? (isMulti ? "0.8em" : "0.88em") : isMulti ? "0.92em" : "1em";
  const detailSize = isMulti ? "0.66em" : "0.72em";

  return (
    <div
      data-print-pill={variant}
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: wingOnTop ? "column" : "row",
        background,
        color,
        border,
        borderRadius: PILL_RADIUS[variant],
        overflow: "hidden",
      }}
    >
      {wing && (
        <span
          data-print-pill-wing={wingOnTop ? "top" : "side"}
          style={{
            // A side wing gives way in a narrow pill, its initials shrinking
            // with it, so the shift label keeps most of the width.
            flex: wingOnTop ? "none" : "0 1 auto",
            minWidth: 0,
            maxWidth: wingOnTop ? undefined : "45%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: wing.background,
            color: wing.color,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "0.02em",
            padding: wingOnTop ? "0.15em 0.1em" : "0 0.25em",
          }}
        >
          <span data-print-fit="" style={FIT_LINE}>
            <span style={{ fontSize: wingOnTop ? "0.58em" : "0.72em" }}>{wing.initials}</span>
          </span>
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
          padding: isNameMode ? "0.2em 0.3em" : "0.2em 0.2em",
          lineHeight: 1.15,
        }}
      >
        {isNameMode ? (
          <>
            <span data-print-fit="" style={FIT_WORDS}>
              <span style={{ fontSize: primarySize, fontWeight: 700 }}>{primaryLabel}</span>
            </span>
            {hasSecondary && (
              <span data-print-fit="" style={FIT_LINE}>
                <span style={{ fontSize: detailSize, fontWeight: 600, opacity: 0.8 }}>
                  {secondaryLabel}
                </span>
              </span>
            )}
          </>
        ) : (
          <span data-print-fit="" style={FIT_LINE}>
            <span style={{ fontSize: primarySize, fontWeight: 700 }}>{primaryLabel}</span>
            {hasSecondary && (
              <>
                <span
                  aria-hidden="true"
                  style={{ fontSize: detailSize, opacity: 0.5, margin: "0 0.1em" }}
                >
                  ·
                </span>
                <span style={{ fontSize: detailSize, fontWeight: 600, opacity: 0.8 }}>
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
              {fmt12hShort(time!.start)}–{fmt12hShort(time!.end)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
