const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SHIFTS = [
  { label: "A", color: "#DBEAFE", text: "#1E40AF", border: "#BFDBFE" },
  { label: "B", color: "#FEF3C7", text: "#92400E", border: "#FDE68A" },
  { label: "P", color: "#D1FAE5", text: "#065F46", border: "#A7F3D0" },
];

const ENTRIES = [
  {
    name: "Sarah Mitchell",
    initials: "SM",
    hue: 210,
    cert: "CSN III",
    // A shifts Mon-Fri, off Sat-Sun
    days: [null, 0, 0, 0, 0, 0, null],
  },
  {
    name: "James Cooper",
    initials: "JC",
    hue: 150,
    cert: "CSN II",
    // B shifts Mon/Wed/Fri/Sat, off others
    days: [null, 1, null, 1, null, 1, 1],
  },
  {
    name: "Maria Santos",
    initials: "MS",
    hue: 30,
    cert: "JLCSN",
    // P shifts Mon-Sat, off Sun
    days: [null, 2, 2, 2, 2, 2, null],
  },
];

export default function RecurringShiftsMockup() {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #CBD5E1",
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.06)",
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "200px repeat(7, minmax(0, 1fr))",
            minWidth: 520,
          }}
        >
          {/* ── Header row ── */}
          <div
            style={{
              background: "#FAFBFC",
              padding: "10px 14px",
              borderBottom: "1px solid #E2E8F0",
              borderRight: "1px solid #E2E8F0",
              fontSize: 10,
              fontWeight: 700,
              color: "#64748B",
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
                padding: "10px 0",
                borderBottom: "1px solid #E2E8F0",
                borderLeft: "1px solid #E2E8F0",
                fontSize: 10,
                fontWeight: 700,
                color: "#94A3B8",
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
            /* Name cell */
            <div
              key={`name-${entry.name}`}
              style={{
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                borderTop: rowIdx > 0 ? "1px solid #E2E8F0" : undefined,
                borderRight: "1px solid #E2E8F0",
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
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#1E293B",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    lineHeight: 1.2,
                  }}
                >
                  {entry.name}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#64748B",
                    lineHeight: 1.2,
                    marginTop: 1,
                  }}
                >
                  {entry.cert}
                </div>
              </div>
            </div>,

            /* Day cells */
            ...entry.days.map((shiftIdx, dayI) => {
              const shift = shiftIdx !== null ? SHIFTS[shiftIdx] : null;
              return (
                <div
                  key={`${entry.name}-${dayI}`}
                  style={{
                    borderTop: rowIdx > 0 ? "1px solid #E2E8F0" : undefined,
                    borderLeft: "1px solid #E2E8F0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "8px 4px",
                    background: shift ? "transparent" : "#F8FAFC",
                  }}
                >
                  {shift ? (
                    <div
                      style={{
                        width: "100%",
                        maxWidth: 64,
                        height: 32,
                        background: shift.color,
                        border: `1px solid ${shift.border}`,
                        borderRadius: 6,
                        color: shift.text,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 800,
                        lineHeight: 1,
                        cursor: "default",
                      }}
                    >
                      {shift.label}
                    </div>
                  ) : (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#CBD5E1",
                        fontWeight: 500,
                      }}
                    >
                      --
                    </span>
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
