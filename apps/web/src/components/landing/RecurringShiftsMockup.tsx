/* ── Recurring shifts mockup ──────────────────────────────────────────────
   Mirrors RecurringScheduleSection. Real component:
   apps/web/src/components/staff/RecurringScheduleSection.tsx — page-title
   header + filter row + grid with sticky Staff column and 7 day columns.
   Cells are absolute-positioned pills inside fixed-height grid cells.
   Dirty (unsaved) cells get a dashed border in the assignment color.
   Empty cells are dashed `--` placeholders. ── */

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ── Assignment colors from Calm Haven seed ── */
const SHIFTS = [
  { label: "D", color: "#FECACA", text: "#991B1B" },  // Day
  { label: "Ds", color: "#FED7AA", text: "#9A3412" }, // Day swing
  { label: "E", color: "#FECACA", text: "#991B1B" },  // Evening
];

/* ── Designation colors — pulled from src/lib/colors.ts DESIGNATION_COLORS ── */
const DESIGNATION_COLORS: Record<string, { bg: string; text: string }> = {
  JLCSN: { bg: "#EDE9FE", text: "#6D28D9" },
  STAFF: { bg: "#F1F5F9", text: "#475569" },
};

/* ── borderColor() — matches the helper in src/lib/colors.ts ── */
function borderColor(textHex: string) {
  const r = parseInt(textHex.slice(1, 3), 16);
  const g = parseInt(textHex.slice(3, 5), 16);
  const b = parseInt(textHex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.35)`;
}

type Entry = {
  name: string;
  cert: keyof typeof DESIGNATION_COLORS;
  isCurrentUser?: boolean;
  // null = empty, number = SHIFTS index. `dirty` flags pull a dashed border.
  days: Array<number | null>;
  dirty?: Record<number, boolean>;
};

const ENTRIES: Entry[] = [
  {
    name: "Carol Henderson",
    cert: "JLCSN",
    days: [null, 1, 1, 1, 1, 1, null],
  },
  {
    name: "Kevin Donovan",
    cert: "STAFF",
    days: [null, 0, null, 0, null, 0, 0],
    // Edited Wed → D (was empty); shows draft-dashed border
    dirty: { 3: true },
  },
  {
    name: "Nancy Thornton",
    cert: "JLCSN",
    isCurrentUser: true,
    days: [null, 0, 0, 0, 0, 0, null],
  },
];

const DIRTY_COUNT = 1;

const NAME_COL = 220;
const DAY_COL_MIN = 72;
const CELL_HEIGHT = 52;
const TEMPLATE = `${NAME_COL}px repeat(7, minmax(${DAY_COL_MIN}px, 1fr))`;

export default function RecurringShiftsMockup() {
  return (
    <div
      style={{
        maxWidth: 800,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Unsaved-changes banner — matches the sticky info banner in the real component */}
      <div
        style={{
          background: "var(--color-info-bg)",
          border: "1px solid var(--color-info-border)",
          borderRadius: 10,
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--color-info)",
              boxShadow: "0 0 0 4px rgba(59,130,246,0.2)",
            }}
          />
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-info-text)",
            }}
          >
            {DIRTY_COUNT} unsaved change
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              padding: "6px 14px",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              background: "var(--color-surface)",
            }}
          >
            Save Draft
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-danger)",
              padding: "6px 14px",
              borderRadius: 6,
              background: "transparent",
            }}
          >
            Discard
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-text-inverse)",
              padding: "6px 18px",
              borderRadius: 6,
              background: "var(--color-brand)",
            }}
          >
            Save Changes
          </div>
        </div>
      </div>

      {/* Page title + description — outside the card, mirrors h1 + p in the real component */}
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          Recurring Shifts
        </h3>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 13,
            color: "var(--color-text-muted)",
            lineHeight: 1.5,
          }}
        >
          Set recurring shift patterns for each staff member. Click any cell to assign a shift.
        </p>
      </div>

      {/* Filter row — Focus Area select (left) + search (right) */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            height: 32,
            padding: "0 10px",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            background: "var(--color-surface)",
            fontSize: 12,
            color: "var(--color-text-secondary)",
            fontWeight: 500,
            minWidth: 160,
          }}
        >
          <span>All Focus Areas</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-text-faint)" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            position: "relative",
            width: 180,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-faint)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <div
            style={{
              height: 32,
              display: "flex",
              alignItems: "center",
              padding: "0 10px 0 32px",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              background: "var(--color-surface)",
              fontSize: 12,
              color: "var(--color-text-faint)",
            }}
          >
            Search...
          </div>
        </div>
      </div>

      {/* Grid card */}
      <div
        style={{
          background: "var(--color-surface)",
          borderRadius: 8,
          border: "1px solid var(--color-border)",
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        {/* Header row — bg --color-bg, footnote font (~11px), uppercase 600, letterSpacing 0.04em */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: TEMPLATE,
            background: "var(--color-bg)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-text-subtle)",
              textTransform: "uppercase" as const,
              letterSpacing: "0.04em",
              borderRight: "1px solid var(--color-border-light)",
            }}
          >
            Staff
          </div>
          {DAY_LABELS.map((day) => (
            <div
              key={day}
              style={{
                padding: "10px 4px",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-text-subtle)",
                textTransform: "uppercase" as const,
                letterSpacing: "0.04em",
                textAlign: "center" as const,
              }}
            >
              {day}
            </div>
          ))}
        </div>

        {ENTRIES.map((entry, rowIdx) => {
          const designation = DESIGNATION_COLORS[entry.cert];
          const rowBg = entry.isCurrentUser
            ? "var(--color-today-bg)"
            : "var(--color-surface)";

          return (
            <div
              key={entry.name}
              style={{
                display: "grid",
                gridTemplateColumns: TEMPLATE,
                borderTop: rowIdx > 0 ? "1px solid var(--color-border-light)" : undefined,
                background: rowBg,
              }}
            >
              {/* Name cell — flex space-between, no avatar; cert pill at right */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "7px 12px",
                  borderRight: "1px solid var(--color-border-light)",
                  background: rowBg,
                  height: CELL_HEIGHT,
                  boxSizing: "border-box" as const,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    minWidth: 0,
                    fontWeight: 600,
                    fontSize: 13,
                    color: "var(--color-text-secondary)",
                    whiteSpace: "nowrap" as const,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  <span
                    style={{
                      whiteSpace: "nowrap" as const,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {entry.name}
                  </span>
                  {entry.isCurrentUser && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 10,
                        background: "var(--color-brand-bg)",
                        color: "var(--color-brand)",
                        whiteSpace: "nowrap" as const,
                        flexShrink: 0,
                      }}
                    >
                      You
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    background: designation.bg,
                    color: designation.text,
                    padding: "2px 7px",
                    borderRadius: 20,
                    whiteSpace: "nowrap" as const,
                    flexShrink: 0,
                    letterSpacing: "0.01em",
                    marginLeft: 6,
                  }}
                >
                  {entry.cert}
                </span>
              </div>

              {/* Day cells — fixed CELL_HEIGHT, pill absolute-positioned inside (4px inset) */}
              {entry.days.map((shiftIdx, dayI) => {
                const shift = shiftIdx !== null ? SHIFTS[shiftIdx] : null;
                const isDirty = !!entry.dirty?.[dayI];

                return (
                  <div
                    key={dayI}
                    style={{
                      position: "relative",
                      height: CELL_HEIGHT,
                      borderLeft: "1px solid var(--color-border-light)",
                    }}
                  >
                    {shift ? (
                      <div
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          bottom: 4,
                          left: 4,
                          background: shift.color,
                          border: isDirty
                            ? `2px dashed ${shift.text}`
                            : `1px solid ${borderColor(shift.text)}`,
                          borderRadius: 8,
                          color: shift.text,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 15,
                          fontWeight: 800,
                          lineHeight: 1,
                        }}
                      >
                        {shift.label}
                      </div>
                    ) : (
                      <div
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          bottom: 4,
                          left: 4,
                          background: "transparent",
                          border: "1px dashed var(--color-border-light)",
                          borderRadius: 8,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--color-text-faint)",
                        }}
                      >
                        --
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
