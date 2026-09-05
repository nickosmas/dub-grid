"use client";

import { useTheme } from "next-themes";
import { resolveShiftPillColors } from "@/lib/colors";

const PREVIEW_DAYS = [
  { label: "SUN", date: 19 },
  { label: "MON", date: 20 },
  { label: "TUE", date: 21, isToday: true },
];

type PreviewCell =
  | { kind: "off" }
  | { kind: "empty" }
  | { kind: "shift"; label: string; secondary?: string; tone?: "teal" };

const PREVIEW_ROWS: { name: string; role: string; badge: string; cells: PreviewCell[] }[] = [
  {
    name: "Jordan Lee",
    role: "DCSN",
    badge: "JLCSN",
    cells: [{ kind: "off" }, { kind: "off" }, { kind: "shift", label: "Ofc" }],
  },
  {
    name: "Morgan Ellis",
    role: "Mentor",
    badge: "JLCSN",
    cells: [
      { kind: "empty" },
      { kind: "shift", label: "Ofc" },
      { kind: "shift", label: "D", secondary: "M", tone: "teal" },
    ],
  },
];

/**
 * A compact, self-contained mockup — not the live app chrome itself — so a
 * user can see what light/dark actually looks like without hunting around
 * the page. Mirrors the real ScheduleGrid's structure (section label bar,
 * Staff/day-header row, name cell + designation badge, shift pills) at a
 * small scale, built from the same `var(--color-*)` tokens and the
 * shift-pill dark-mode resolver the real grid uses, so it re-renders
 * instantly whenever the selected theme changes.
 */
export function AppearancePreview() {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";

  return (
    <div aria-hidden="true" style={{ maxWidth: 320 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: "var(--dg-color-text-secondary)",
          marginBottom: 8,
          padding: "5px 8px 5px 7px",
          background: "var(--dg-color-bg-secondary)",
          borderRadius: "var(--dg-radius-sm)",
          display: "flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <span
          style={{ width: 3, height: 14, borderRadius: 2, background: "var(--dg-color-brand)" }}
        />
        Nursing
      </div>

      <div
        style={{
          border: "1px solid var(--dg-color-border)",
          borderRadius: "var(--dg-radius-md)",
          background: "var(--dg-color-surface)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex" }}>
          <div
            style={{
              width: 88,
              flexShrink: 0,
              padding: "6px 8px",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: "var(--dg-color-text-subtle)",
              boxShadow: "1px 0 0 0 var(--dg-color-border-light)",
            }}
          >
            Staff
          </div>
          {PREVIEW_DAYS.map((day) => (
            <div
              key={day.label}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "5px 0",
                boxShadow: "1px 0 0 0 var(--dg-color-border-light)",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  color: day.isToday ? "var(--dg-color-today-text)" : "var(--dg-color-text-subtle)",
                }}
              >
                {day.label}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  color: day.isToday
                    ? "var(--dg-color-today-text)"
                    : "var(--dg-color-text-secondary)",
                }}
              >
                {day.date}
              </div>
            </div>
          ))}
        </div>

        {PREVIEW_ROWS.map((row, ri) => (
          <div
            key={row.name}
            style={{
              display: "flex",
              borderTop:
                ri > 0
                  ? "1px solid var(--dg-color-border-light)"
                  : "1px solid var(--dg-color-border)",
            }}
          >
            <div
              style={{
                width: 88,
                flexShrink: 0,
                padding: "6px 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 4,
                minWidth: 0,
                boxShadow: "1px 0 0 0 var(--dg-color-border-light)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--dg-color-text-secondary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.name}
                </div>
                <div style={{ fontSize: 8, color: "var(--dg-color-text-subtle)" }}>{row.role}</div>
              </div>
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  background: "#EDE9FE",
                  color: "#6D28D9",
                  padding: "1px 5px",
                  borderRadius: 20,
                  flexShrink: 0,
                }}
              >
                {row.badge}
              </span>
            </div>
            {row.cells.map((cell, ci) => (
              <div
                key={ci}
                style={{
                  flex: 1,
                  position: "relative",
                  height: 38,
                  boxShadow: "1px 0 0 0 var(--dg-color-border-light)",
                }}
              >
                {cell.kind === "off" && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 4,
                      borderRadius: "var(--dg-radius-sm)",
                      background: "var(--dg-color-text-subtle)",
                      color: "var(--dg-color-surface)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    X
                  </div>
                )}
                {cell.kind === "shift" &&
                  (() => {
                    const resolved =
                      cell.tone === "teal"
                        ? resolveShiftPillColors(
                            { color: "#99F6E4", text: "#0F766E", border: "#5EEAD4" },
                            isDarkTheme,
                          )
                        : {
                            color: "var(--dg-color-bg-secondary)",
                            text: "var(--dg-color-text-secondary)",
                            border: "var(--dg-color-border)",
                          };
                    return (
                      <div
                        style={{
                          position: "absolute",
                          inset: 4,
                          borderRadius: "var(--dg-radius-sm)",
                          background: resolved.color,
                          color: resolved.text,
                          border: `1px solid ${resolved.border}`,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 0,
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.2 }}>
                          {cell.label}
                        </span>
                        {cell.secondary && (
                          <span
                            style={{ fontSize: 8, fontWeight: 700, lineHeight: 1.2, opacity: 0.78 }}
                          >
                            {cell.secondary}
                          </span>
                        )}
                      </div>
                    );
                  })()}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
