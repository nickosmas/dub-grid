const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

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
    shift: 0,
    frequency: "Weekly",
    days: [true, true, true, true, true, false, false],
  },
  {
    name: "James Cooper",
    initials: "JC",
    hue: 150,
    shift: 1,
    frequency: "Biweekly",
    days: [true, false, true, false, true, true, false],
  },
  {
    name: "Maria Santos",
    initials: "MS",
    hue: 30,
    shift: 2,
    frequency: "Daily",
    days: [true, true, true, true, true, true, true],
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
      {/* Header */}
      <div
        className="hidden sm:grid"
        style={{
          gridTemplateColumns: "1.4fr 0.5fr 0.6fr 1fr",
          padding: "12px 24px",
          background: "#FAFBFC",
          borderBottom: "1px solid #E2E8F0",
        }}
      >
        {["Employee", "Shift", "Frequency", "Days"].map((col) => (
          <span
            key={col}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#64748B",
              letterSpacing: "0.06em",
            }}
          >
            {col}
          </span>
        ))}
      </div>

      {/* Rows */}
      {ENTRIES.map((entry, idx) => {
        const shift = SHIFTS[entry.shift];
        return (
          <div
            key={entry.name}
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 0.5fr 0.6fr 1fr",
              alignItems: "center",
              padding: "14px 24px",
              borderTop: idx > 0 ? "1px solid #E2E8F0" : undefined,
            }}
          >
            {/* Name + avatar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 800,
                  background: `hsl(${entry.hue}, 70%, 92%)`,
                  color: `hsl(${entry.hue}, 70%, 35%)`,
                  border: `1px solid hsl(${entry.hue}, 70%, 85%)`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  flexShrink: 0,
                }}
              >
                {entry.initials}
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#1E293B",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {entry.name}
              </span>
            </div>

            {/* Shift code pill */}
            <div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  borderRadius: 6,
                  padding: "4px 12px",
                  background: shift.color,
                  color: shift.text,
                  border: `1px solid ${shift.border}`,
                  display: "inline-block",
                }}
              >
                {shift.label}
              </span>
            </div>

            {/* Frequency */}
            <div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 10,
                  padding: "2px 8px",
                  background: "#F1F5F9",
                  color: "#475569",
                  whiteSpace: "nowrap",
                }}
              >
                {entry.frequency}
              </span>
            </div>

            {/* Days of week */}
            <div
              style={{
                display: "flex",
                gap: 4,
              }}
            >
              {DAY_LABELS.map((d, di) => (
                <div
                  key={`${entry.name}-${di}`}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    background: entry.days[di] ? "#1B3A2D" : "#F1F5F9",
                    color: entry.days[di] ? "#fff" : "#94A3B8",
                    cursor: "default",
                  }}
                >
                  {d}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
