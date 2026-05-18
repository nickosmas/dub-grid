const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ── Assignment labels from Calm Haven seed ── */
const SHIFTS = [
  { label: "D", color: "#FECACA", text: "#991B1B" },
  { label: "Ds", color: "#FED7AA", text: "#9A3412" },
  { label: "E", color: "#FECACA", text: "#991B1B" },
];

/* ── borderColor() — matches ScheduleGrid.tsx borderColor helper ── */
function borderColor(textHex: string) {
  const r = parseInt(textHex.slice(1, 3), 16);
  const g = parseInt(textHex.slice(3, 5), 16);
  const b = parseInt(textHex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.35)`;
}

const ENTRIES = [
  {
    name: "Carol Henderson",
    initials: "CH",
    hue: 150,
    cert: "JLCSN",
    // Ds shifts Mon-Fri, off Sat-Sun
    days: [null, 1, 1, 1, 1, 1, null],
  },
  {
    name: "Kevin Donovan",
    initials: "KD",
    hue: 210,
    cert: "STAFF",
    // D shifts Mon/Wed/Fri/Sat, off others
    days: [null, 0, null, 0, null, 0, 0],
  },
  {
    name: "Nancy Thornton",
    initials: "NT",
    hue: 270,
    cert: "JLCSN",
    // D shifts Mon-Sat, off Sun
    days: [null, 0, 0, 0, 0, 0, null],
  },
];

export default function RecurringShiftsMockup() {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        border: "1px solid var(--color-border)",
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      {/* Section title + description — mirrors RecurringScheduleSection.tsx header */}
      <div style={{ padding: "16px 20px 12px" }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          Recurring Shifts
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--color-text-muted)",
            marginTop: 4,
          }}
        >
          Set a weekly template per staff member. Apply it to any date range in one click.
        </div>
      </div>

      {/* Filter row — Focus Area dropdown + Search */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          padding: "0 20px 14px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 12px",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            background: "var(--color-surface)",
            fontSize: 13,
            color: "var(--color-text-secondary)",
            fontWeight: 500,
          }}
        >
          <span style={{ color: "var(--color-text-faint)" }}>Focus Area:</span>
          <span>All</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-text-faint)" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 180,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 12px",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            background: "var(--color-surface)",
            fontSize: 13,
            color: "var(--color-text-faint)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Search staff</span>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "200px repeat(7, minmax(0, 1fr))",
            minWidth: 520,
          }}
        >
          {/* ── Header row — matches real: #FAFBFC bg, 10px font, 700 weight ── */}
          <div
            style={{
              background: "#FAFBFC",
              padding: "10px 16px",
              borderBottom: "1px solid var(--color-border-light)",
              borderRight: "1px solid var(--color-border-light)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--color-text-subtle)",
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              display: "flex",
              alignItems: "center",
            }}
          >
            Staff
          </div>
          {DAY_LABELS.map((day) => (
            <div
              key={day}
              style={{
                background: "#FAFBFC",
                padding: "10px 4px",
                borderBottom: "1px solid var(--color-border-light)",
                borderLeft: "1px solid var(--color-border-light)",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--color-text-faint)",
                letterSpacing: "0.06em",
                textTransform: "uppercase" as const,
                textAlign: "center",
              }}
            >
              {day}
            </div>
          ))}

          {/* ── Employee rows ── */}
          {ENTRIES.map((entry, rowIdx) => [
            /* Name cell — matches real: padding 10px 16px, borderRight */
            <div
              key={`name-${entry.name}`}
              style={{
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                borderTop: rowIdx > 0 ? "1px solid var(--color-border-light)" : undefined,
                borderRight: "1px solid var(--color-border-light)",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 800,
                  background: `hsl(${entry.hue}, 70%, 92%)`,
                  color: `hsl(${entry.hue}, 70%, 35%)`,
                  border: `1px solid hsl(${entry.hue}, 70%, 85%)`,
                  flexShrink: 0,
                }}
              >
                {entry.initials}
              </div>
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    lineHeight: 1.2,
                  }}
                >
                  {entry.name}
                </div>
                <span
                  style={{
                    alignSelf: "flex-start",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 6,
                    background: "var(--color-bg-secondary)",
                    color: "var(--color-text-muted)",
                    border: "1px solid var(--color-border-light)",
                    lineHeight: 1.4,
                    letterSpacing: "0.02em",
                  }}
                >
                  {entry.cert}
                </span>
              </div>
            </div>,

            /* Day cells */
            ...entry.days.map((shiftIdx, dayI) => {
              const shift = shiftIdx !== null ? SHIFTS[shiftIdx] : null;
              return (
                <div
                  key={`${entry.name}-${dayI}`}
                  style={{
                    borderTop: rowIdx > 0 ? "1px solid var(--color-border-light)" : undefined,
                    borderLeft: "1px solid var(--color-border-light)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "6px 4px",
                  }}
                >
                  {shift ? (
                    <div
                      style={{
                        width: "100%",
                        maxWidth: 64,
                        height: 32,
                        background: shift.color,
                        border: `1px solid ${borderColor(shift.text)}`,
                        borderRadius: 8,
                        color: shift.text,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 800,
                        lineHeight: 1,
                        cursor: "default",
                      }}
                    >
                      {shift.label}
                    </div>
                  ) : (
                    /* Empty cell — matches real: #F8FAFC bg, var(--color-border-light) border, 8px radius */
                    <div
                      style={{
                        width: "100%",
                        maxWidth: 64,
                        height: 32,
                        background: "#F8FAFC",
                        border: "1px solid var(--color-border-light)",
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
            }),
          ])}
        </div>
      </div>
    </div>
  );
}
