const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DATES = [22, 23, 24, 25, 26, 27, 28];
const TODAY_INDEX = 0; // Sun Mar 22

/* ── Shift codes from Calm Haven seed ── */
const SHIFT_CODES = [
  { label: "D", color: "#FECACA", text: "#991B1B" },
  { label: "Ds", color: "#FED7AA", text: "#9A3412" },
  { label: "E", color: "#FECACA", text: "#991B1B" },
  { label: "Es", color: "#E9D5FF", text: "#6B21A8" },
  { label: "Dcn", color: "#BFDBFE", text: "#1E40AF" },
  { label: "X", color: "#C8D6EC", text: "#1A2640" },
  { label: "Ofc", color: "#C8D6EC", text: "#1A2640" },
];

/* ── Certification badge colors — matches DESIGNATION_COLORS in colors.ts ── */
const CERTS = [
  { abbr: "JLCSN", bg: "#EDE9FE", text: "#6D28D9" },
  { abbr: "STAFF", bg: "#EDF1F7", text: "#334766" },
  { abbr: "CSN III", bg: "#DBEAFE", text: "#1D4ED8" },
  { abbr: "CSN II", bg: "#CCFBF1", text: "#0E7490" },
];

interface Employee {
  name: string;
  cert: number;
  roles: string;
  shifts: (number | null)[];
}

const SECTIONS = [
  {
    name: "Skilled Nursing",
    employees: [
      { name: "Margaret Sullivan", cert: 0, roles: "DCSN", shifts: [5, 6, 6, 5, 6, 5, 5] },
      { name: "Carol Henderson", cert: 0, roles: "Supv", shifts: [5, 1, 1, 2, 1, 1, 5] },
      { name: "Kevin Donovan", cert: 1, roles: "", shifts: [5, 0, 0, 0, 0, 0, 5] },
      { name: "Nancy Thornton", cert: 0, roles: "", shifts: [5, 0, 0, 0, 0, null, 5] },
      { name: "Barbara Trent", cert: 1, roles: "", shifts: [5, 0, null, 0, 0, 0, 5] },
    ] as Employee[],
    coverage: [
      { label: "D", required: 3, counts: [0, 3, 2, 3, 3, 2, 0] },
      { label: "Ds", required: 1, counts: [0, 1, 1, 0, 1, 1, 0] },
    ],
  },
  {
    name: "Sheltered Care",
    employees: [
      { name: "Evelyn Hartwell", cert: 0, roles: "SC Mgr", shifts: [5, 4, 4, 6, 4, 4, 5] },
      { name: "Thomas Crawford", cert: 0, roles: "Mentor", shifts: [5, 0, 0, 0, 0, null, 5] },
      { name: "Brian Shepherd", cert: 1, roles: "", shifts: [5, 0, null, 0, 0, 0, 5] },
    ] as Employee[],
    coverage: [
      { label: "D", required: 1, counts: [0, 1, 1, 1, 1, 1, 0] },
      { label: "Dcn", required: 1, counts: [0, 1, 1, 0, 1, 1, 0] },
    ],
  },
];

/* ── borderColor() — matches ScheduleGrid.tsx borderColor helper ── */
function borderColor(textHex: string) {
  const r = parseInt(textHex.slice(1, 3), 16);
  const g = parseInt(textHex.slice(3, 5), 16);
  const b = parseInt(textHex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.35)`;
}

function ShiftCell({ shiftIdx, isToday }: { shiftIdx: number | null; isToday: boolean }) {
  const shift = shiftIdx !== null ? SHIFT_CODES[shiftIdx] : null;
  return (
    <div
      style={{
        borderTop: "1px solid var(--color-border-light)",
        borderLeft: "1px solid var(--color-border-light)",
        background: isToday ? "#F0F9FF" : "transparent",
        position: "relative",
        height: 52,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
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
            border: `1px solid ${borderColor(shift.text)}`,
            borderRadius: 8,
            color: shift.text,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
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
            width: 16,
            height: 2,
            background: "var(--color-border-light)",
            borderRadius: 2,
            display: "block",
          }}
        />
      )}
    </div>
  );
}

function CoverageCell({ label, actual, required, isToday }: { label: string; actual: number; required: number; isToday: boolean }) {
  const met = actual >= required;
  return (
    <div
      style={{
        textAlign: "center",
        padding: "8px 4px",
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1.3,
        borderLeft: "1px solid var(--color-border)",
        background: met ? "rgba(22,163,74,0.10)" : "rgba(220,38,38,0.10)",
        color: met ? "#15803D" : "#991B1B",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        whiteSpace: "nowrap",
        gap: 3,
      }}
    >
      {met ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" /></svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" /></svg>
      )}
      {label}: {actual}/{required}
    </div>
  );
}

export default function ScheduleGridMockup() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* ── Toolbar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 12,
        }}
      >
        {/* Week nav group */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Prev */}
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "default",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </div>
          {/* Date label */}
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              minWidth: 120,
              textAlign: "center",
              userSelect: "none",
            }}
          >
            Mar 22 &ndash; Mar 28
          </span>
          {/* Next */}
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "default",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </div>
          {/* Today button */}
          <div
            style={{
              height: 34,
              padding: "0 14px",
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-text-muted)",
              cursor: "default",
            }}
          >
            Today
          </div>
        </div>

        {/* Focus area filter tabs — .dg-span-tabs--light style */}
        <div
          className="hidden sm:flex"
          style={{
            display: "inline-flex",
            height: 34,
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            padding: 3,
            gap: 2,
            alignItems: "center",
          }}
        >
          {["All", "Skilled Nursing", "Sheltered Care"].map((label, i) => (
            <span
              key={label}
              style={{
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                color: i === 0 ? "#fff" : "var(--color-text-muted)",
                background: i === 0 ? "var(--color-text-primary)" : "transparent",
                borderRadius: 8,
                cursor: "default",
                whiteSpace: "nowrap",
                lineHeight: 1,
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Focus area sections ── */}
      {SECTIONS.map((section) => (
        <div key={section.name}>
          {/* Section header — matches ScheduleGrid section heading */}
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "var(--color-text-secondary)",
              marginBottom: 10,
              paddingLeft: 4,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {/* Accent bar */}
            <span
              style={{
                width: 3,
                height: 18,
                borderRadius: 2,
                background: "linear-gradient(135deg, var(--color-border-focus), #818CF8)",
                flexShrink: 0,
              }}
            />
            {section.name}
          </div>

          {/* Section card */}
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid var(--color-border)",
              overflow: "hidden",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "220px repeat(7, minmax(72px, 1fr))",
                  minWidth: 640,
                }}
              >
                {/* ── Header row ── */}
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 4,
                    background: "#F8FAFC",
                    borderRight: "1px solid var(--color-border-light)",
                    borderBottom: "2px solid var(--color-text-primary)",
                    padding: "10px 12px",
                    boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--color-text-subtle)",
                    letterSpacing: "0.04em",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  Staff
                </div>
                {DAYS.map((day, i) => {
                  const isToday = i === TODAY_INDEX;
                  return (
                    <div
                      key={day}
                      style={{
                        textAlign: "center",
                        padding: "8px 0",
                        borderBottom: "2px solid var(--color-text-primary)",
                        borderLeft: "1px solid var(--color-border-light)",
                        background: isToday ? "#F0F9FF" : "transparent",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: isToday ? "#0284C7" : "var(--color-text-subtle)",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {day}
                      </div>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: isToday ? "#0284C7" : "var(--color-text-secondary)",
                          lineHeight: 1.1,
                          marginTop: 1,
                        }}
                      >
                        {DATES[i]}
                      </div>
                    </div>
                  );
                })}

                {/* ── Employee rows ── */}
                {section.employees.map((emp, ri) => {
                  const cert = CERTS[emp.cert];
                  return [
                    <div
                      key={`name-${emp.name}`}
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 3,
                        background: "#fff",
                        padding: "7px 12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        borderRight: "1px solid var(--color-border-light)",
                        borderTop: ri > 0 ? "1px solid var(--color-border-light)" : undefined,
                        boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--color-text-secondary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            lineHeight: 1.1,
                          }}
                        >
                          {emp.name}
                        </div>
                        {emp.roles && (
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--color-text-subtle)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              lineHeight: 1.1,
                            }}
                          >
                            {emp.roles}
                          </div>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          background: cert.bg,
                          color: cert.text,
                          padding: "2px 7px",
                          borderRadius: 20,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                          letterSpacing: "0.01em",
                        }}
                      >
                        {cert.abbr}
                      </span>
                    </div>,
                    ...emp.shifts.map((shiftIdx, dayI) => (
                      <ShiftCell
                        key={`${emp.name}-${dayI}`}
                        shiftIdx={shiftIdx}
                        isToday={dayI === TODAY_INDEX}
                      />
                    )),
                  ];
                })}

                {/* ── Coverage rows ── */}
                {section.coverage.map((cov, covIdx) => [
                  <div
                    key={`cov-name-${cov.label}`}
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      background: "#fff",
                      padding: "6px 14px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--color-text-secondary)",
                      letterSpacing: "0.05em",
                      borderRight: "1px solid var(--color-border)",
                      borderTop: covIdx === 0 ? "2px solid var(--color-text-primary)" : undefined,
                      borderBottom: covIdx < section.coverage.length - 1 ? "1px solid var(--color-border)" : undefined,
                      boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {cov.label} Shift
                  </div>,
                  ...cov.counts.map((actual, dayI) => (
                    <div
                      key={`cov-${cov.label}-${dayI}`}
                      style={{
                        borderTop: covIdx === 0 ? "2px solid var(--color-text-primary)" : undefined,
                        borderBottom: covIdx < section.coverage.length - 1 ? "1px solid var(--color-border)" : undefined,
                      }}
                    >
                      <CoverageCell
                        label={cov.label}
                        actual={actual}
                        required={cov.required}
                        isToday={dayI === TODAY_INDEX}
                      />
                    </div>
                  )),
                ])}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
