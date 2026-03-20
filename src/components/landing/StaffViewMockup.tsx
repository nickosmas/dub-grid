const FOCUS_AREAS = [
  { name: "Wing A", bg: "#DBEAFE", text: "#1E40AF" },
  { name: "Wing B", bg: "#DCFCE7", text: "#166534" },
  { name: "Wing C", bg: "#FEF3C7", text: "#92400E" },
];

const STATUSES = [
  { label: "Linked", bg: "#DCFCE7", text: "#166534" },
  { label: "Invited", bg: "#FEF3C7", text: "#92400E" },
];

const STAFF = [
  {
    name: "Sarah Mitchell",
    initials: "SM",
    hue: 210,
    email: "s.mitchell@example.com",
    focusAreas: [0],
    cert: "CSN III",
    status: 0,
  },
  {
    name: "James Cooper",
    initials: "JC",
    hue: 150,
    email: "j.cooper@example.com",
    focusAreas: [1],
    cert: "CSN II",
    status: 0,
  },
  {
    name: "Maria Santos",
    initials: "MS",
    hue: 30,
    email: "m.santos@example.com",
    focusAreas: [0, 2],
    cert: "JLCSN",
    status: 0,
  },
  {
    name: "David Park",
    initials: "DP",
    hue: 270,
    email: "d.park@example.com",
    focusAreas: [1],
    cert: "CSN III",
    status: 1,
  },
];

const HEADER_COLS = ["Name", "Focus Area", "Certification", "Status"];

export default function StaffViewMockup() {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #CBD5E1",
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 24px",
          borderBottom: "1px solid #E2E8F0",
        }}
      >
        {/* Status tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              background: "#fff",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                background: "#16A34A",
                borderRadius: 6,
                cursor: "default",
              }}
            >
              Active
            </span>
            <span
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                color: "#64748B",
                cursor: "default",
              }}
            >
              Benched
            </span>
          </div>
          <span
            className="hidden sm:inline"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#64748B",
            }}
          >
            4 members
          </span>
        </div>

        {/* Search */}
        <div style={{ position: "relative", minWidth: 160 }}>
          <svg
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#94A3B8",
            }}
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <div
            style={{
              height: 30,
              borderRadius: 10,
              border: "1px solid #E2E8F0",
              background: "#fff",
              paddingLeft: 32,
              fontSize: 12,
              color: "#94A3B8",
              display: "flex",
              alignItems: "center",
            }}
          >
            Find staff&hellip;
          </div>
        </div>
      </div>

      {/* Header row */}
      <div
        className="hidden sm:grid"
        style={{
          gridTemplateColumns: "1.4fr 1fr 0.6fr 0.5fr",
          padding: "12px 24px",
          background: "#FAFBFC",
          borderBottom: "1px solid #E2E8F0",
        }}
      >
        {HEADER_COLS.map((col) => (
          <span
            key={col}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#64748B",
              letterSpacing: "0.06em",
              display: "flex",
              alignItems: "center",
            }}
          >
            {col}
          </span>
        ))}
      </div>

      {/* Rows */}
      {STAFF.map((person, idx) => {
        const status = STATUSES[person.status];
        return (
          <div
            key={person.name}
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr 0.6fr 0.5fr",
              alignItems: "center",
              padding: "14px 24px",
              borderTop: idx > 0 ? "1px solid #E2E8F0" : undefined,
              borderLeft: "4px solid transparent",
              transition: "all 0.15s ease",
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
                  background: `hsl(${person.hue}, 70%, 92%)`,
                  color: `hsl(${person.hue}, 70%, 35%)`,
                  border: `1px solid hsl(${person.hue}, 70%, 85%)`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  flexShrink: 0,
                }}
              >
                {person.initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#1E293B",
                    lineHeight: 1.3,
                  }}
                >
                  {person.name}
                </div>
                <div
                  className="hidden sm:block"
                  style={{
                    fontSize: 11,
                    color: "#94A3B8",
                    marginTop: 1,
                  }}
                >
                  {person.email}
                </div>
              </div>
            </div>

            {/* Focus areas */}
            <div
              className="hidden sm:flex"
              style={{
                alignItems: "center",
                gap: 4,
                flexWrap: "wrap",
              }}
            >
              {person.focusAreas.map((faIdx) => {
                const fa = FOCUS_AREAS[faIdx];
                return (
                  <span
                    key={fa.name}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 20,
                      padding: "2px 8px",
                      background: fa.bg,
                      color: fa.text,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fa.name}
                  </span>
                );
              })}
            </div>

            {/* Certification */}
            <div className="hidden sm:block">
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 20,
                  padding: "3px 9px",
                  background: "#E2E8F0",
                  color: "#475569",
                  whiteSpace: "nowrap",
                }}
              >
                {person.cert}
              </span>
            </div>

            {/* Status */}
            <div
              className="hidden sm:flex"
              style={{ justifyContent: "flex-start" }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 10,
                  padding: "2px 8px",
                  background: status.bg,
                  color: status.text,
                  whiteSpace: "nowrap",
                }}
              >
                {status.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
