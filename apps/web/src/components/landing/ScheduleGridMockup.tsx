/* ── Schedule grid mockup ──────────────────────────────────────────────
   Faithful representation of the live ScheduleGrid for the Skilled Nursing
   focus area, using Calm Haven seed data (supabase/seed_calm_haven.sql).
   Modeled on:
     · apps/web/src/components/ScheduleGrid.tsx
     · apps/web/src/lib/assignable-shifts.ts (buildShiftDisplayParts)
   Shifts: Day (D, cyan) and Evening (E, amber) — both in fa_snw.
   Jobs that show on grid: Supervisor (S), Mentor (M), Office (Ofc),
     Partial (0.3). The "Default shift job" is `show_on_grid: false` so an
     employee with no job override just sees the shift abbr alone.

   Pill colors run through the same `resolveShiftPillColors` remap the real
   grid uses (via useShiftPillColors) — rendered as-is, these pastel presets
   read as blown-out, glaring blocks on the dark-mode page. ── */

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { resolveShiftPillColors } from "@/lib/colors";

function useMockupIsDark(): boolean {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return mounted && resolvedTheme === "dark";
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DATES = [22, 23, 24, 25, 26, 27, 28];
const TODAY_INDEX = 0; // Sun 22 is "today"

const ROW_HEIGHT = 56; // matches --dg-grid-row-h
const NAME_COL_WIDTH = 220;

/* ── Shifts (Skilled Nursing focus area) — colors come straight from
   shift_categories rows in seed_calm_haven.sql lines 143/147. ── */
const SHIFTS = {
  D: {
    name: "Day",
    bg: "#A5F3FC",
    text: "#155E75",
    border: "#155E75",
  },
  E: {
    name: "Evening",
    bg: "#FDE68A",
    text: "#92400E",
    border: "#92400E",
  },
} as const;

/* ── Jobs (with_shift) — show on grid as the pill's secondaryLabel.
   Seed lines 351/362. Default shift job is `show_on_grid: false`, so
   employees with no override render with no secondary label. ── */
const JOBS = {
  S: "S", // Supervisor
  M: "M", // Mentor
} as const;

/* ── Shiftless jobs — render as their own pill that fills the cell, with
   the job's own color (seed lines 318/329). No shift, no secondary. ── */
const SHIFTLESS = {
  Ofc: { bg: "#E2E8F0", text: "#1E293B", border: "transparent" },
  "0.3": { bg: "#FDE68A", text: "#92400E", border: "transparent" },
} as const;

/* ── Absences — seed lines 175–185 (border_color always transparent). ── */
const ABSENCES = {
  X: { label: "X", bg: "#E2E8F0", text: "#1E293B", border: "transparent" },
  PTO: { label: "PTO", bg: "#FDE68A", text: "#92400E", border: "transparent" },
  Sick: { label: "S", bg: "#FECDD3", text: "#9F1239", border: "transparent" },
} as const;

/* ── Certifications — DESIGNATION_COLORS subset, names from seed line 236. ── */
const CERTS = {
  JLCSN: { bg: "#EDE9FE", text: "#6D28D9" },
  "CSN III": { bg: "#DBEAFE", text: "#1D4ED8" },
  "CSN II": { bg: "#CCFBF1", text: "#0E7490" },
  Nurse: { bg: "#F1F5F9", text: "#475569" },
} as const;

type ShiftCode = keyof typeof SHIFTS;
type JobCode = keyof typeof JOBS;
type ShiftlessCode = keyof typeof SHIFTLESS;
type AbsenceCode = keyof typeof ABSENCES;
type CertCode = keyof typeof CERTS;

/* A worked-shift assignment: a shift code plus optional with_shift job.
   `needed` is only meaningful for open-shift entries (how many teammates
   the slot still needs); assigned cells never set it. */
type ShiftAssignment = { shift: ShiftCode; job?: JobCode; needed?: number };

/* A cell value: shift, shiftless job, absence, split shift, or empty. */
type Cell =
  | ShiftAssignment
  | { shiftless: ShiftlessCode }
  | { absence: AbsenceCode }
  | [ShiftAssignment, ShiftAssignment]
  | null;

/* ── Tiny helpers to keep the data arrays readable ── */
const sh = (shift: ShiftCode, job?: JobCode): ShiftAssignment => ({
  shift,
  ...(job ? { job } : {}),
});
const sl = (j: ShiftlessCode) => ({ shiftless: j });
const ab = (a: AbsenceCode) => ({ absence: a });

const STAFF: {
  name: string;
  roles: string;
  cert: CertCode;
  days: Cell[];
}[] = [
  {
    name: "Margaret Sullivan",
    roles: "DCSN",
    cert: "JLCSN",
    // From seed: all weekdays Ofc, weekends off
    days: [ab("X"), sl("Ofc"), sl("Ofc"), ab("X"), sl("Ofc"), ab("X"), ab("X")],
  },
  {
    name: "Thomas Crawford",
    roles: "Mentor",
    cert: "JLCSN",
    // Mentor jobs on Day shifts (seed renders these as "(D)" → D/M)
    days: [ab("X"), sh("D", "M"), ab("X"), sh("D", "M"), sh("D", "M"), sh("D", "M"), ab("X")],
  },
  {
    name: "Carol Henderson",
    roles: "Supv",
    cert: "CSN III",
    // Supervisor on Day, split shift Wed (Day-Supv → Evening)
    days: [
      ab("X"),
      sh("D", "S"),
      sh("D", "S"),
      [sh("D", "S"), sh("E")],
      sh("D", "S"),
      sh("E"),
      ab("X"),
    ],
  },
  {
    name: "Nancy Thornton",
    roles: "",
    cert: "JLCSN",
    // No role override → just "D" on grid
    days: [ab("X"), sh("D"), sh("D"), sh("D"), sh("D"), null, ab("X")],
  },
  {
    name: "Kevin Donovan",
    roles: "",
    cert: "Nurse",
    // No role override → just "E"; PTO Friday
    days: [ab("X"), sh("E"), sh("E"), sh("E"), sh("E"), ab("PTO"), ab("X")],
  },
  {
    name: "Barbara Trent",
    roles: "",
    cert: "Nurse",
    // Sick Tuesday — absence "S"
    days: [ab("X"), sh("D"), ab("Sick"), sh("D"), sh("D"), sh("D"), ab("X")],
  },
];

/* Open shifts row — each entry is a (shift, job?) pair (full
   ShiftJobSegment). Most open shifts have no job override (default job is
   hidden on grid), so they render as just the shift abbr. */
const OPEN_SHIFTS: ShiftAssignment[][] = [
  [sh("D")], // Sun
  [], // Mon — fully staffed
  [sh("D")], // Tue — Barbara sick
  [], // Wed
  [], // Thu
  [sh("E")], // Fri — Kevin PTO
  [sh("D"), sh("E")], // Sat — short on weekend
];

const OPEN_TOTAL = OPEN_SHIFTS.reduce((acc, day) => acc + day.length, 0);

/* Per-shift coverage tallies — one row per shift category only. Counts
   include every assignment of that shift across all jobs (D + Ds + Dm). */
const COVERAGE: {
  code: ShiftCode;
  required: number;
  scheduled: number[];
}[] = [
  // Day = all D / Ds / Dm + Day half of split shifts
  { code: "D", required: 3, scheduled: [0, 4, 3, 4, 4, 3, 0] },
  // Evening = all E / Es + Evening half of split shifts
  { code: "E", required: 1, scheduled: [0, 1, 1, 2, 1, 1, 0] },
];

/* ── Warning tokens as CSS vars (not hardcoded hex) so the row follows the
   page theme like ScheduleGrid.tsx does — dg-warning-bg etc. remap in dark
   mode via the design-tokens theme block. ── */
const WARNING_BG = "var(--dg-color-warning-bg, #FFF8E1)";
const WARNING_BORDER = "var(--dg-color-warning-border, #F59E0B)";
const WARNING_TEXT = "var(--dg-color-warning-text, #92400E)";
const WARNING_SOLID = "var(--dg-color-warning)";
/* Repeating-linear-gradient dashed divider — ScheduleGrid.tsx uses this
   background-image technique (not a literal `border` with style dashed)
   because Chromium clips border/box-shadow decorations on position:sticky
   elements at fractional browser zoom (see globals.css data-bottom-divider
   rules and the Open Shifts label cell in ScheduleGrid.tsx). */
const WARNING_DASH_DIVIDER: React.CSSProperties = {
  backgroundImage: `repeating-linear-gradient(to right, ${WARNING_BORDER} 0 6px, transparent 6px 10px)`,
  backgroundPosition: "0 100%",
  backgroundRepeat: "no-repeat",
  backgroundSize: "100% 2px",
};
const TODAY_BG = "color-mix(in srgb, var(--dg-color-brand) 4%, transparent)";

function CertPill({ kind }: { kind: CertCode }) {
  const isDark = useMockupIsDark();
  const raw = CERTS[kind];
  const c = resolveShiftPillColors(
    { color: raw.bg, text: raw.text, border: "transparent" },
    isDark,
  );
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        background: c.color,
        color: c.text,
        padding: "2px 7px",
        borderRadius: 20,
        whiteSpace: "nowrap",
        flexShrink: 0,
        letterSpacing: "0.01em",
      }}
    >
      {kind}
    </span>
  );
}

/* Single pill — fills its cell, two-line layout when there's a secondary
   label (the with_shift job abbr). Matches buildShiftDisplayParts in
   assignable-shifts.ts: secondaryLabel = jobAbbr in code mode. */
function SinglePill({
  primary,
  secondary,
  bg,
  text,
  border,
}: {
  primary: string;
  secondary?: string | null;
  bg: string;
  text: string;
  border: string;
}) {
  return (
    <span
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: bg,
        color: text,
        border: `1px solid ${border}`,
        borderRadius: "var(--dg-radius-md)",
        padding: "2px 6px",
        lineHeight: 1.1,
        letterSpacing: "0.01em",
        gap: 1,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 800 }}>{primary}</span>
      {secondary && (
        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.78 }}>{secondary}</span>
      )}
    </span>
  );
}

/* Split-shift row — pills side-by-side horizontally (data-shift-pill="multi"
   uses flexDirection: "row" + gap: 1 at line 2778 of ScheduleGrid.tsx). */
function SplitShiftRow({ pair }: { pair: [ShiftAssignment, ShiftAssignment] }) {
  const isDark = useMockupIsDark();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        gap: 1,
        width: "100%",
        height: "100%",
      }}
    >
      {pair.map((seg, i) => {
        const raw = SHIFTS[seg.shift];
        const s = resolveShiftPillColors(
          { color: raw.bg, text: raw.text, border: raw.border },
          isDark,
        );
        return (
          <span
            key={`${seg.shift}-${seg.job ?? "_"}-${i}`}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: s.color,
              color: s.text,
              border: `1px solid ${s.border}`,
              borderRadius: "var(--dg-radius-sm)",
              padding: "2px 3px",
              lineHeight: 1.05,
              letterSpacing: "0.01em",
              gap: 1,
              overflow: "hidden",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800 }}>{seg.shift}</span>
            {seg.job && (
              <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.78 }}>{seg.job}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/* Open-shift pill. Unlike an assigned cell's pill, this does NOT take the
   shift's own color (D=cyan/E=amber) — ScheduleGrid.tsx only colors an open
   shift from a specific prior assignment (e.g. a call-off that inherited
   its color), and a freshly-unfilled slot has no assignment to inherit
   from, so it falls back to a plain surface fill with a dashed amber
   border/text and a small amber "needed" count badge. */
function OpenShiftPill({ seg }: { seg: ShiftAssignment }) {
  const needed = seg.needed ?? 1;
  const hasSecondaryLabel = !!seg.job;
  return (
    <span
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        flex: "1 1 72px",
        minWidth: 0,
        maxWidth: "100%",
        padding: hasSecondaryLabel ? "4px 8px" : "5px 8px",
        borderRadius: "var(--dg-radius-sm)",
        border: `1.5px dashed ${WARNING_BORDER}`,
        background: "var(--dg-color-surface)",
        color: WARNING_TEXT,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.3,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: hasSecondaryLabel ? 1 : 0,
          minWidth: 0,
        }}
      >
        <span style={{ fontWeight: 800, lineHeight: 1.1 }}>{seg.shift}</span>
        {seg.job && (
          <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.3, opacity: 0.78 }}>
            {seg.job}
          </span>
        )}
      </span>
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: WARNING_SOLID,
          color: "var(--dg-color-text-inverse)",
          fontSize: 10,
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        {needed}
      </span>
    </span>
  );
}

function CellContent({ cell }: { cell: Cell }) {
  const isDark = useMockupIsDark();
  if (cell == null) return null;
  if (Array.isArray(cell)) return <SplitShiftRow pair={cell} />;
  if ("shift" in cell) {
    const raw = SHIFTS[cell.shift];
    const s = resolveShiftPillColors({ color: raw.bg, text: raw.text, border: raw.border }, isDark);
    return (
      <SinglePill
        primary={cell.shift}
        secondary={cell.job ?? null}
        bg={s.color}
        text={s.text}
        border={s.border}
      />
    );
  }
  if ("shiftless" in cell) {
    const raw = SHIFTLESS[cell.shiftless];
    const j = resolveShiftPillColors({ color: raw.bg, text: raw.text, border: raw.border }, isDark);
    return <SinglePill primary={cell.shiftless} bg={j.color} text={j.text} border={j.border} />;
  }
  // Absence — secondaryLabel is always null for absences (line 2347)
  const raw = ABSENCES[cell.absence];
  const a = resolveShiftPillColors({ color: raw.bg, text: raw.text, border: raw.border }, isDark);
  return <SinglePill primary={raw.label} bg={a.color} text={a.text} border={a.border} />;
}

function TallyCell({ required, scheduled }: { required: number; scheduled: number }) {
  const hasRequirement = required > 0;
  const met = scheduled >= required;
  const displayValue = scheduled > 0 || hasRequirement ? String(scheduled) : "-";
  return (
    <div
      style={{
        textAlign: "center",
        padding: "8px 6px",
        fontSize: 12,
        lineHeight: 1.4,
        fontWeight: 600,
        fontFamily: "var(--font-dm-mono), 'DM Mono', monospace",
        color: hasRequirement
          ? met
            ? "var(--dg-color-success-text)"
            : "var(--dg-color-danger-dark)"
          : "var(--dg-color-text-muted)",
        background: hasRequirement
          ? met
            ? "rgba(22, 163, 74, 0.12)"
            : "rgba(220, 38, 38, 0.12)"
          : "var(--dg-color-surface)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
      }}
    >
      {displayValue}
    </div>
  );
}

export default function ScheduleGridMockup() {
  const gridTemplate = `${NAME_COL_WIDTH}px repeat(7, minmax(0, 1fr))`;
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      {/* Focus area section heading — a full-width bar (not a hugging pill)
          sitting ABOVE the grid card with a 3px brand-colored accent bar.
          Matches ScheduleGrid.tsx's section label exactly: `display: flex`
          (a block-level flex container, so the background spans the same
          width as the grid card below it), not `inline-flex`. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px 6px 8px",
          marginBottom: 10,
          borderRadius: "var(--dg-radius-sm)",
          background: "var(--dg-color-bg-secondary)",
          color: "var(--dg-color-text-secondary)",
          fontSize: "var(--dg-fs-heading)",
          fontWeight: 800,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 3,
            height: 18,
            borderRadius: 2,
            background: "var(--dg-color-brand)",
            flexShrink: 0,
          }}
        />
        Skilled Nursing
      </div>

      {/* No toolbar here — ScheduleGrid.tsx's own card starts directly with
          the grid (Staff/day header row). The week-nav/Publish toolbar is a
          separate, unconnected element the schedule page renders above the
          card (components/Toolbar.tsx + DraftBanner.tsx), not part of
          ScheduleGrid itself, so the mockup omits it rather than fake it. */}
      <div
        style={{
          background: "var(--dg-color-surface)",
          borderRadius: 14,
          border: "1px solid var(--dg-color-border)",
          overflow: "hidden",
        }}
      >
        {/* A picture of a schedule, not a schedule. Nothing in here is
            interactive — no handlers, no focusable cells — so exposing it as
            role="grid" invited assistive tech and AI agents to navigate a week
            of fake data cell by cell. The CSS Grid layout also has no row
            elements to carry the role="row" that a grid requires between
            itself and its headers, which failed three audits at once:
            aria-required-children, aria-required-parent, and the agentic
            accessibility tree. One labelled image says the true thing. */}
        <div
          role="img"
          aria-label={
            "Illustration of a week of the Skilled Nursing schedule: staff " +
            "listed down the left, their shifts filled in across seven days, " +
            "with open shifts highlighted."
          }
          style={{
            display: "grid",
            gridTemplateColumns: gridTemplate,
          }}
        >
          {/* Header row */}
          <div
            style={{
              position: "sticky",
              left: 0,
              zIndex: 4,
              background: "var(--dg-color-bg)",
              padding: "10px 14px",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--dg-color-text-subtle)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              borderRight: "1px solid var(--dg-color-border-light)",
              borderBottom: "1px solid var(--dg-color-text-secondary)",
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            Staff
          </div>
          {DAYS.map((day, idx) => {
            const isToday = idx === TODAY_INDEX;
            return (
              <div
                key={day}
                style={{
                  position: "relative",
                  textAlign: "center",
                  padding: "8px 0",
                  background: isToday ? TODAY_BG : "var(--dg-color-bg)",
                  borderLeft: idx === 0 ? undefined : "1px solid var(--dg-color-border-light)",
                  borderBottom: "1px solid var(--dg-color-text-secondary)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isToday ? "var(--dg-color-brand)" : "var(--dg-color-text-subtle)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {day}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: isToday ? "var(--dg-color-brand)" : "var(--dg-color-text-secondary)",
                    lineHeight: 1.1,
                    marginTop: 2,
                  }}
                >
                  {DATES[idx]}
                </div>
              </div>
            );
          })}

          {/* Open shifts row — matches the real grid: briefcase glyph + label + count badge,
              warning bg, dashed bottom divider drawn via the same repeating-gradient
              background-image ScheduleGrid.tsx uses (not a literal dashed border). */}
          <div
            style={{
              position: "sticky",
              left: 0,
              zIndex: 3,
              background: WARNING_BG,
              padding: "0 10px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              minHeight: ROW_HEIGHT,
              borderRight: "1px solid var(--dg-color-border-light)",
              color: WARNING_TEXT,
              whiteSpace: "nowrap" as const,
              ...WARNING_DASH_DIVIDER,
            }}
          >
            {/* Briefcase glyph */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.01em",
              }}
            >
              Open Shifts
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 18,
                height: 18,
                padding: "0 5px",
                borderRadius: 9,
                background: WARNING_SOLID,
                color: "var(--dg-color-text-inverse)",
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {OPEN_TOTAL}
            </span>
          </div>
          {OPEN_SHIFTS.map((openList, idx) => {
            const isToday = idx === TODAY_INDEX;
            return (
              <div
                key={`open-${idx}`}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignContent: "flex-start",
                  alignItems: "flex-start",
                  gap: 6,
                  padding: 6,
                  minHeight: ROW_HEIGHT,
                  background: isToday
                    ? `linear-gradient(${TODAY_BG}, ${TODAY_BG}), ${WARNING_BG}`
                    : WARNING_BG,
                  borderLeft: idx === 0 ? undefined : "1px solid var(--dg-color-border-light)",
                  ...WARNING_DASH_DIVIDER,
                }}
              >
                {openList.map((seg, i) => (
                  <OpenShiftPill key={`${seg.shift}-${seg.job ?? "_"}-${i}`} seg={seg} />
                ))}
              </div>
            );
          })}

          {/* Employee rows */}
          {STAFF.map((emp) => (
            <EmployeeRow key={emp.name} emp={emp} todayIndex={TODAY_INDEX} />
          ))}

          {/* Coverage tally rows — one per shift category (Day, Evening) */}
          {COVERAGE.map((row, rowIdx) => (
            <CoverageRow
              key={row.code}
              row={row}
              isLast={rowIdx === COVERAGE.length - 1}
              todayIndex={TODAY_INDEX}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmployeeRow({ emp, todayIndex }: { emp: (typeof STAFF)[number]; todayIndex: number }) {
  return (
    <>
      <div
        style={{
          position: "sticky",
          left: 0,
          zIndex: 3,
          background: "var(--dg-color-surface)",
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          minWidth: 0,
          minHeight: ROW_HEIGHT,
          borderTop: "1px solid var(--dg-color-border-light)",
          borderRight: "1px solid var(--dg-color-border-light)",
        }}
      >
        <div
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--dg-color-text-secondary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.2,
            }}
          >
            {emp.name}
          </span>
          {emp.roles && (
            <span
              style={{
                fontSize: 11,
                color: "var(--dg-color-text-subtle)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                lineHeight: 1.2,
                marginTop: 1,
              }}
            >
              {emp.roles}
            </span>
          )}
        </div>
        <CertPill kind={emp.cert} />
      </div>

      {emp.days.map((cell, idx) => {
        const isToday = idx === todayIndex;
        return (
          <div
            key={`${emp.name}-${idx}`}
            style={{
              display: "flex",
              alignItems: "stretch",
              padding: 4,
              minHeight: ROW_HEIGHT,
              background: isToday ? TODAY_BG : "var(--dg-color-surface)",
              borderTop: "1px solid var(--dg-color-border-light)",
              borderLeft: idx === 0 ? undefined : "1px solid var(--dg-color-border-light)",
            }}
          >
            <CellContent cell={cell} />
          </div>
        );
      })}
    </>
  );
}

function CoverageRow({
  row,
  isLast,
  todayIndex,
}: {
  row: (typeof COVERAGE)[number];
  isLast: boolean;
  todayIndex: number;
}) {
  return (
    <>
      <div
        style={{
          position: "sticky",
          left: 0,
          zIndex: 3,
          background: "var(--dg-color-surface)",
          padding: "6px 14px",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--dg-color-text-muted)",
          letterSpacing: "0.04em",
          borderTop: "1px solid var(--dg-color-border-light)",
          borderRight: "1px solid var(--dg-color-border-light)",
          borderBottom: isLast ? undefined : "1px solid var(--dg-color-border-light)",
          display: "flex",
          alignItems: "center",
        }}
      >
        {SHIFTS[row.code].name}
      </div>
      {row.scheduled.map((scheduled, idx) => {
        const isToday = idx === todayIndex;
        return (
          <div
            key={idx}
            style={{
              position: "relative",
              borderTop: "1px solid var(--dg-color-border-light)",
              borderLeft: idx === 0 ? undefined : "1px solid var(--dg-color-border-light)",
              borderBottom: isLast ? undefined : "1px solid var(--dg-color-border-light)",
              background: isToday ? TODAY_BG : undefined,
            }}
          >
            <TallyCell required={row.required} scheduled={scheduled} />
          </div>
        );
      })}
    </>
  );
}
