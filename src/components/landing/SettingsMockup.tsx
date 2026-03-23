/* ── Color swatches — 24px circles matching the real SettingsPage color picker ── */
const COLOR_SWATCHES = [
  { bg: "#FED7AA", text: "#9A3412" },
  { bg: "#E9D5FF", text: "#6B21A8" },
  { bg: "#FECDD3", text: "#9F1239" },
  { bg: "#FDE68A", text: "#92400E" },
  { bg: "#DBEAFE", text: "#1E40AF" },
  { bg: "#E5F0FF", text: "#1A3A7A" },
  { bg: "#FCE7F3", text: "#9D174D" },
  { bg: "#EDF1F7", text: "#334766" },
];

/* ── Focus areas from Calm Haven — read-only display uses neutral badge with color dot ── */
const FOCUS_AREAS = [
  { name: "Skilled Nursing", colorIdx: 0, editing: false },
  { name: "Sheltered Care", colorIdx: 1, editing: true },
  { name: "Night Shift", colorIdx: 2, editing: false },
  { name: "Visiting CSNS", colorIdx: 3, editing: false },
];

/* ── Drag handle — SVG matching the real 6-dot grip icon ── */
function DragHandle() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="var(--color-text-faint)"
      style={{ flexShrink: 0, cursor: "grab" }}
    >
      <rect x="3" y="1" width="2" height="2" rx="1" />
      <rect x="9" y="1" width="2" height="2" rx="1" />
      <rect x="3" y="6" width="2" height="2" rx="1" />
      <rect x="9" y="6" width="2" height="2" rx="1" />
      <rect x="3" y="11" width="2" height="2" rx="1" />
      <rect x="9" y="11" width="2" height="2" rx="1" />
    </svg>
  );
}

export default function SettingsMockup() {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid var(--color-border)",
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        maxWidth: 560,
        margin: "0 auto",
      }}
    >
      {/* ── Custom Labels Section ── */}
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--color-border-light)",
          fontWeight: 700,
          fontSize: 14,
          color: "var(--color-text-secondary)",
        }}
      >
        Custom Labels
      </div>
      <div style={{ padding: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16,
          }}
        >
          {[
            {
              label: "Focus Areas Label",
              value: "Wings",
              helper: "Focus Areas, Departments, Units",
            },
            {
              label: "Certifications Label",
              value: "Certifications",
              helper: "Certifications, Designations",
            },
            {
              label: "Roles Label",
              value: "Roles",
              helper: "Responsibilities, Positions",
            },
          ].map((field) => (
            <div key={field.label}>
              {/* Label — matches labelStyle: 11px, 700, var(--color-text-subtle), 0.04em, uppercase */}
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--color-text-subtle)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase" as const,
                  marginBottom: 5,
                }}
              >
                {field.label}
              </div>
              {/* Input — matches real: borderRadius 10px, padding 7px 12px, fontSize 13px */}
              <div
                style={{
                  fontSize: 13,
                  padding: "7px 12px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  color: "var(--color-text-secondary)",
                  background: "#fff",
                }}
              >
                {field.value}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  marginTop: 4,
                }}
              >
                {field.helper}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Wings Section (focus areas) ── */}
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--color-border-light)",
          borderTop: "1px solid var(--color-border-light)",
          fontWeight: 700,
          fontSize: 14,
          color: "var(--color-text-secondary)",
        }}
      >
        Wings
      </div>
      <div style={{ padding: "0" }}>
        {FOCUS_AREAS.map((fa, idx) => {
          const swatch = COLOR_SWATCHES[fa.colorIdx];
          return (
            <div
              key={fa.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 12px",
                borderBottom: idx < FOCUS_AREAS.length - 1 ? "1px solid var(--color-border-light)" : undefined,
              }}
            >
              <DragHandle />

              {fa.editing ? (
                <>
                  {/* Badge preview (in editing mode) */}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      borderRadius: 20,
                      padding: "3px 12px",
                      background: "var(--color-bg-secondary)",
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--color-border-light)",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: swatch.bg,
                        flexShrink: 0,
                      }}
                    />
                    {fa.name}
                  </span>

                  {/* Name input — focused style */}
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      padding: "7px 12px",
                      border: "1px solid var(--color-border-focus)",
                      borderRadius: 10,
                      color: "var(--color-text-secondary)",
                      background: "#fff",
                      flex: 1,
                      minWidth: 0,
                      boxShadow: "0 0 0 3px rgba(56,189,248,0.15)",
                    }}
                  >
                    {fa.name}
                  </div>

                  {/* Color swatches — 24px circles with 8px inner dot */}
                  <div
                    className="hidden sm:flex"
                    style={{
                      alignItems: "center",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    {COLOR_SWATCHES.map((sw, si) => (
                      <div
                        key={si}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: sw.bg,
                          border:
                            si === fa.colorIdx
                              ? `2px solid ${sw.text}`
                              : "1px solid var(--color-border)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "default",
                        }}
                      >
                        {si === fa.colorIdx && (
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: sw.text,
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {/* Read-only badge — neutral pill with color dot */}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      borderRadius: 20,
                      padding: "3px 12px",
                      background: "var(--color-bg-secondary)",
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--color-border-light)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: swatch.bg,
                        flexShrink: 0,
                      }}
                    />
                    {fa.name}
                  </span>
                  <div style={{ flex: 1 }} />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
