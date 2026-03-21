const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DATES = [16, 17, 18, 19, 20, 21, 22];
const TODAY_INDEX = 3;

const SHIFT_CODES = [
  { label: "A", color: "#DBEAFE", text: "#1E40AF", border: "#BFDBFE" },
  { label: "B", color: "#FEF3C7", text: "#92400E", border: "#FDE68A" },
  { label: "P", color: "#D1FAE5", text: "#065F46", border: "#A7F3D0" },
  { label: "N", color: "#EDE9FE", text: "#5B21B6", border: "#DDD6FE" },
  { label: "X", color: "#FEE2E2", text: "#991B1B", border: "#FECACA" },
];

const CERTS = [
  { abbr: "CSN III", bg: "#DBEAFE", text: "#1D4ED8" },
  { abbr: "CSN II", bg: "#CCFBF1", text: "#0E7490" },
  { abbr: "JLCSN", bg: "#EDE9FE", text: "#6D28D9" },
  { abbr: "STAFF", bg: "#F1F5F9", text: "#475569" },
];

interface Employee {
  name: string;
  cert: number;
  roles: string;
  shifts: (number | null)[];
}

const SECTIONS = [
  {
    name: "ICU",
    employees: [
      { name: "Sarah Mitchell", cert: 0, roles: "Nurse", shifts: [0, 0, 0, 0, 0, null, null] },
      { name: "James Cooper", cert: 1, roles: "Nurse", shifts: [1, 1, null, 1, 1, 1, null] },
      { name: "Maria Santos", cert: 2, roles: "Aide", shifts: [2, null, 2, 2, null, 2, 2] },
    ] as Employee[],
    coverage: [
      { label: "A", required: 2, counts: [1, 1, 1, 1, 1, 0, 0] },
      { label: "B", required: 1, counts: [1, 1, 0, 1, 1, 1, 0] },
    ],
  },
  {
    name: "ER",
    employees: [
      { name: "David Park", cert: 0, roles: "Nurse", shifts: [3, 3, 3, null, 3, null, 3] },
      { name: "Lisa Chen", cert: 3, roles: "Aide", shifts: [null, 0, 0, 0, null, 0, 0] },
    ] as Employee[],
    coverage: [
      { label: "A", required: 1, counts: [0, 1, 1, 1, 0, 1, 1] },
    ],
  },
];

function ShiftCell({ shiftIdx, isToday }: { shiftIdx: number | null; isToday: boolean }) {
  const shift = shiftIdx !== null ? SHIFT_CODES[shiftIdx] : null;
  return (
    <div
      style={{
        borderBottom: "1px solid #E2E8F0",
        borderLeft: "1px solid #E2E8F0",
        background: isToday ? "#F0F9FF" : "transparent",
        position: "relative",
        height: 48,
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
            border: `1px solid ${shift.border}`,
            borderRadius: 6,
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
            background: "#E2E8F0",
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
        padding: "4px 2px",
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1.3,
        borderLeft: "1px solid #E2E8F0",
        background: isToday
          ? met ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)"
          : met ? "rgba(22,163,74,0.04)" : "rgba(220,38,38,0.04)",
        color: met ? "#16A34A" : "#DC2626",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        whiteSpace: "nowrap",
      }}
    >
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
      {/* Toolbar */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #CBD5E1",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
        }}
      >
        {/* Week nav */}
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
          <span style={{ padding: "7px 10px", fontSize: 13, color: "#94A3B8", cursor: "default" }}>
            &lsaquo;
          </span>
          <span
            style={{
              padding: "7px 12px",
              fontSize: 13,
              fontWeight: 700,
              color: "#1E293B",
              borderLeft: "1px solid #E2E8F0",
              borderRight: "1px solid #E2E8F0",
              whiteSpace: "nowrap",
            }}
          >
            Mar 16 &ndash; Mar 22
          </span>
          <span
            style={{
              padding: "7px 8px",
              fontSize: 12,
              fontWeight: 600,
              color: "#64748B",
              borderRight: "1px solid #E2E8F0",
              cursor: "default",
            }}
          >
            Today
          </span>
          <span style={{ padding: "7px 10px", fontSize: 13, color: "#94A3B8", cursor: "default" }}>
            &rsaquo;
          </span>
        </div>

        {/* Focus area filter */}
        <div
          className="hidden sm:flex"
          style={{
            alignItems: "center",
            border: "1px solid #E2E8F0",
            borderRadius: 8,
            background: "#fff",
            overflow: "hidden",
          }}
        >
          {["All", "ICU", "ER"].map((label, i) => (
            <span
              key={label}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                color: i === 0 ? "#fff" : "#64748B",
                background: i === 0 ? "#1B3A2D" : "transparent",
                borderRadius: i === 0 ? 6 : 0,
                cursor: "default",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Focus area sections */}
      {SECTIONS.map((section) => (
        <div key={section.name}>
          {/* Section header */}
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#1E293B",
              marginBottom: 10,
              paddingLeft: 4,
            }}
          >
            {section.name}
          </div>

          {/* Section card */}
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #CBD5E1",
              overflow: "hidden",
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
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
                    zIndex: 3,
                    background: "#fff",
                    borderRight: "1px solid #E2E8F0",
                    borderBottom: "2px solid #0F172A",
                    padding: "8px 14px",
                    boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#64748B",
                    letterSpacing: "0.08em",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  STAFF NAME
                </div>
                {DAYS.map((day, i) => {
                  const isToday = i === TODAY_INDEX;
                  return (
                    <div
                      key={day}
                      style={{
                        textAlign: "center",
                        padding: "8px 0",
                        borderBottom: "2px solid #0F172A",
                        borderLeft: "1px solid #E2E8F0",
                        background: isToday ? "#F0F9FF" : "transparent",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: isToday ? "#0284C7" : "#94A3B8",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {day}
                      </div>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: isToday ? "#0284C7" : "#1E293B",
                          lineHeight: 1.2,
                          marginTop: 1,
                        }}
                      >
                        {DATES[i]}
                      </div>
                    </div>
                  );
                })}

                {/* ── Employee rows ── */}
                {section.employees.map((emp) => {
                  const cert = CERTS[emp.cert];
                  return [
                    <div
                      key={`name-${emp.name}`}
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 3,
                        background: "#fff",
                        padding: "7px 12px 7px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        borderRight: "1px solid #E2E8F0",
                        borderBottom: "1px solid #E2E8F0",
                        boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "#1E293B",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            lineHeight: 1.2,
                          }}
                        >
                          {emp.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#64748B",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            lineHeight: 1.2,
                          }}
                        >
                          {emp.roles}
                        </div>
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
                      zIndex: 3,
                      background: "#fff",
                      padding: "6px 14px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#1E293B",
                      letterSpacing: "0.05em",
                      borderRight: "1px solid #CBD5E1",
                      borderTop: covIdx === 0 ? "2px solid #0F172A" : "1px solid #E2E8F0",
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
                        borderTop: covIdx === 0 ? "2px solid #0F172A" : "1px solid #E2E8F0",
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
