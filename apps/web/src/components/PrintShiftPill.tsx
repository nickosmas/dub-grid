import type { CSSProperties } from "react";

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
  /** A month's ~31 columns leave each pill a few characters wide. */
  isDense: boolean;
  /** Puts the wing above the label, for a pill too narrow to share a row. */
  wingOnTop: boolean;
}

// The print window has no app CSS variables, so the corners are literal, in em
// so they scale with the chosen print size. Paper reads best with tighter
// corners than the grid's 8px and 6px.
const PILL_RADIUS = { single: "0.35em", multi: "0.3em" } as const;

const ONE_LINE: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "100%",
  minWidth: 0,
};

// Wraps only between words: a name broken mid-word ("Eveni/ng") reads worse
// than one shortened with an ellipsis.
const TWO_LINES: CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
  maxWidth: "100%",
};

/**
 * One printed shift. The focus-area wing is a flex item rather than an
 * overlay, so a label can never run underneath it whatever font the print
 * window ends up with.
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
  isDense,
  wingOnTop,
}: PrintShiftPillProps) {
  const isMulti = variant === "multi";
  const hasTime = !!time && !!(time.start || time.end);
  const hasSecondary = !!secondaryLabel;
  const primarySize = isNameMode ? (isMulti ? "0.8em" : "0.88em") : isMulti ? "0.92em" : "1em";
  const detailSize = isMulti || isDense ? "0.66em" : "0.72em";

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
          data-print-pill-wing="true"
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: wing.background,
            color: wing.color,
            fontSize: wingOnTop ? "0.58em" : isMulti ? "0.66em" : "0.72em",
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "0.02em",
            padding: wingOnTop ? "0.2em 0" : "0 0.35em",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {wing.initials}
        </span>
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.1em",
          padding: isDense ? "0.15em 0.1em" : isNameMode ? "0.2em 0.35em" : "0.2em 0.25em",
          textAlign: "center",
          lineHeight: 1.15,
        }}
      >
        {isNameMode ? (
          <>
            <span
              style={{
                fontSize: primarySize,
                fontWeight: 700,
                ...(hasSecondary || hasTime || isDense || isMulti ? ONE_LINE : TWO_LINES),
              }}
            >
              {primaryLabel}
            </span>
            {hasSecondary && (
              <span style={{ fontSize: detailSize, fontWeight: 600, opacity: 0.8, ...ONE_LINE }}>
                {secondaryLabel}
              </span>
            )}
          </>
        ) : (
          <span
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "center",
              gap: "0.2em",
              maxWidth: "100%",
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: primarySize, fontWeight: 700, flexShrink: 0, ...ONE_LINE }}>
              {primaryLabel}
            </span>
            {hasSecondary && (
              <>
                <span
                  aria-hidden="true"
                  style={{ fontSize: detailSize, opacity: 0.5, flex: "none" }}
                >
                  ·
                </span>
                <span style={{ fontSize: detailSize, fontWeight: 600, opacity: 0.8, ...ONE_LINE }}>
                  {secondaryLabel}
                </span>
              </>
            )}
          </span>
        )}
        {hasTime && (
          <span
            style={{
              fontSize: detailSize,
              fontWeight: 500,
              opacity: 0.75,
              letterSpacing: "0.01em",
              ...(isDense
                ? {
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    lineHeight: 1.1,
                  }
                : ONE_LINE),
            }}
          >
            {isDense ? (
              <>
                <span>{fmt12hShort(time!.start)}</span>
                <span>{fmt12hShort(time!.end)}</span>
              </>
            ) : (
              `${fmt12hShort(time!.start)}–${fmt12hShort(time!.end)}`
            )}
          </span>
        )}
      </div>
    </div>
  );
}
