/* ── Focus area colors from Calm Haven seed — shown as a 6px dot inside neutral badges ── */
const FOCUS_AREAS = [
  { name: "Skilled Nursing", dotColor: "#FED7AA" },
  { name: "Sheltered Care", dotColor: "#E9D5FF" },
  { name: "Night Shift", dotColor: "#FECDD3" },
  { name: "Visiting CSNS", dotColor: "#FDE68A" },
];

/* ── Account statuses — matches real semantic colors ── */
const STATUSES = [
  { label: "Linked", bg: "var(--color-brand-bg)", text: "var(--color-link)" },
  { label: "Invited", bg: "#FFFBEB", text: "#92400E" },
  { label: "Not invited", bg: "var(--color-border-light)", text: "var(--color-text-muted)" },
];

const STAFF = [
  {
    name: "Margaret Sullivan",
    initials: "MS",
    hue: 270,
    focusAreas: [0],
    cert: "JLCSN",
    roles: "DCSN",
    status: 0,
  },
  {
    name: "Carol Henderson",
    initials: "CH",
    hue: 150,
    focusAreas: [0, 1],
    cert: "JLCSN",
    roles: "Supv",
    status: 0,
  },
  {
    name: "Evelyn Hartwell",
    initials: "EH",
    hue: 30,
    focusAreas: [0, 1],
    cert: "JLCSN",
    roles: "SC Mgr",
    status: 0,
  },
  {
    name: "Kevin Donovan",
    initials: "KD",
    hue: 210,
    focusAreas: [0],
    cert: "STAFF",
    roles: "",
    status: 1,
  },
  {
    name: "Hannah Stratton",
    initials: "HS",
    hue: 340,
    focusAreas: [2],
    cert: "JLCSN",
    roles: "Supv",
    status: 0,
  },
  {
    name: "Marilyn Davenport",
    initials: "MD",
    hue: 50,
    focusAreas: [3],
    cert: "JLCSN",
    roles: "DVCSN",
    status: 2,
  },
];

const HEADER_COLS = ["Name", "Assigned Wings", "Certification", "Roles", "Account"];

export default function StaffViewMockup() {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        border: "1px solid var(--color-border)",
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      {/* ── Tabs bar — matches real TabsTrigger line variant ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          background: "#F8FAFC",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {[
            { label: "Active", count: 6, active: true },
            { label: "Benched", count: 0, active: false },
            { label: "Terminated", count: 0, active: false },
          ].map((tab) => (
            <span
              key={tab.label}
              style={{
                padding: "12px 12px",
                fontSize: 13,
                fontWeight: tab.active ? 600 : 400,
                color: tab.active ? "var(--color-text-primary)" : "var(--color-text-muted)",
                borderBottom: tab.active ? "2px solid var(--color-text-primary)" : "2px solid transparent",
                cursor: "default",
                display: "flex",
                alignItems: "center",
                gap: 6,
                position: "relative",
              }}
            >
              {tab.label}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  height: 16,
                  minWidth: 16,
                  borderRadius: 10,
                  padding: "0 4px",
                  background: tab.active ? "var(--color-bg-secondary)" : "var(--color-bg-secondary)",
                  color: tab.active ? "var(--color-text-muted)" : "var(--color-text-subtle)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                {tab.count}
              </span>
            </span>
          ))}
        </div>

        {/* Search — matches .dg-input style */}
        <div className="hidden sm:block" style={{ position: "relative", minWidth: 160 }}>
          <svg
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-faint)",
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
              height: 34,
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              background: "#fff",
              paddingLeft: 32,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--color-text-faint)",
              display: "flex",
              alignItems: "center",
            }}
          >
            Search&hellip;
          </div>
        </div>
      </div>

      {/* ── Header row — matches real grid columns and styling ── */}
      <div
        className="hidden sm:grid"
        style={{
          gridTemplateColumns: "48px 1.2fr 1fr 0.6fr 0.8fr 0.5fr 28px",
          padding: "12px 24px",
          background: "#FAFBFC",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        {/* Checkbox column header */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              border: "1.5px solid var(--color-border)",
              background: "#fff",
            }}
          />
        </div>
        {HEADER_COLS.map((col) => (
          <span
            key={col}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--color-text-subtle)",
              letterSpacing: "0.06em",
              display: "flex",
              alignItems: "center",
            }}
          >
            {col}
          </span>
        ))}
        {/* Menu column spacer */}
        <div />
      </div>

      {/* ── Rows ── */}
      {STAFF.map((person, idx) => {
        const status = STATUSES[person.status];
        return (
          <div
            key={person.name}
            style={{
              display: "grid",
              gridTemplateColumns: "48px 1.2fr 1fr 0.6fr 0.8fr 0.5fr 28px",
              alignItems: "center",
              padding: "14px 24px",
              borderTop: idx > 0 ? "1px solid var(--color-border-light)" : undefined,
              transition: "background 150ms ease",
            }}
          >
            {/* Checkbox */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  border: "1.5px solid var(--color-border)",
                  background: "#fff",
                }}
              />
            </div>

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
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
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
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.3,
                  }}
                >
                  {person.name}
                </div>
              </div>
            </div>

            {/* Focus areas — neutral badge with color dot (matches real StaffView) */}
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
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 20,
                      padding: "2px 8px",
                      background: "var(--color-bg-secondary)",
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--color-border-light)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: fa.dotColor,
                        flexShrink: 0,
                      }}
                    />
                    {fa.name}
                  </span>
                );
              })}
            </div>

            {/* Certification — matches real: var(--color-border-light) bg, var(--color-text-muted) text */}
            <div className="hidden sm:block">
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 20,
                  padding: "3px 9px",
                  background: "var(--color-border-light)",
                  color: "var(--color-text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {person.cert}
              </span>
            </div>

            {/* Roles — plain text, not badge (matches real StaffView) */}
            <div className="hidden sm:block">
              <span
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                }}
              >
                {person.roles || "—"}
              </span>
            </div>

            {/* Account status */}
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

            {/* Menu chevron */}
            <div
              className="hidden sm:flex"
              style={{
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text-faint)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}
