const COLOR_SWATCHES = [
  { bg: "#DBEAFE", text: "#1E40AF" },
  { bg: "#DCFCE7", text: "#166534" },
  { bg: "#FEF3C7", text: "#92400E" },
  { bg: "#EDE9FE", text: "#6D28D9" },
  { bg: "#FEE2E2", text: "#991B1B" },
  { bg: "#CCFBF1", text: "#0E7490" },
  { bg: "#FCE7F3", text: "#9D174D" },
  { bg: "#F1F5F9", text: "#475569" },
];

const FOCUS_AREAS = [
  { name: "Wing A", colorIdx: 0, editing: false },
  { name: "Wing B", colorIdx: 1, editing: true },
  { name: "Wing C", colorIdx: 2, editing: false },
];

function DragHandle() {
  return (
    <svg
      width="10"
      height="16"
      viewBox="0 0 10 16"
      fill="#94A3B8"
      style={{ flexShrink: 0, cursor: "grab" }}
    >
      <circle cx="3" cy="2" r="1.5" />
      <circle cx="7" cy="2" r="1.5" />
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="7" cy="8" r="1.5" />
      <circle cx="3" cy="14" r="1.5" />
      <circle cx="7" cy="14" r="1.5" />
    </svg>
  );
}

export default function SettingsMockup() {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #CBD5E1",
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)",
        maxWidth: 560,
        margin: "0 auto",
      }}
    >
      {/* ── Custom Labels Section ── */}
      <div
        style={{
          background: "#0F172A",
          padding: "10px 20px",
          fontSize: 13,
          fontWeight: 700,
          color: "#fff",
        }}
      >
        Custom Labels
      </div>
      <div style={{ padding: "20px 20px 24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16,
          }}
        >
          {[
            {
              label: "Focus Area Label",
              value: "Wings",
              placeholder: "e.g. Focus Areas, Departments",
            },
            {
              label: "Certification Label",
              value: "Skill Levels",
              placeholder: "e.g. Certifications, Levels",
            },
            {
              label: "Role Label",
              value: "Roles",
              placeholder: "e.g. Roles, Positions",
            },
          ].map((field) => (
            <div key={field.label}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#64748B",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase" as const,
                  marginBottom: 6,
                }}
              >
                {field.label}
              </div>
              <div
                style={{
                  fontSize: 13,
                  padding: "8px 10px",
                  border: "1.5px solid #E2E8F0",
                  borderRadius: 8,
                  color: "#1E293B",
                  background: "#fff",
                }}
              >
                {field.value}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#94A3B8",
                  marginTop: 4,
                }}
              >
                {field.placeholder}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Focus Areas Section ── */}
      <div
        style={{
          background: "#0F172A",
          padding: "10px 20px",
          fontSize: 13,
          fontWeight: 700,
          color: "#fff",
          borderTop: "1px solid #CBD5E1",
        }}
      >
        Wings
      </div>
      <div style={{ padding: "16px 20px 20px" }}>
        {FOCUS_AREAS.map((fa, idx) => {
          const swatch = COLOR_SWATCHES[fa.colorIdx];
          return (
            <div
              key={fa.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderTop: idx > 0 ? "1px solid #F1F5F9" : undefined,
              }}
            >
              <DragHandle />

              {/* Preview badge */}
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 20,
                  padding: "3px 10px",
                  background: swatch.bg,
                  color: swatch.text,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {fa.name}
              </span>

              {fa.editing ? (
                <>
                  {/* Name input */}
                  <div
                    style={{
                      fontSize: 13,
                      padding: "6px 10px",
                      border: "1.5px solid #93C5FD",
                      borderRadius: 8,
                      color: "#1E293B",
                      background: "#fff",
                      flex: 1,
                      minWidth: 0,
                      boxShadow: "0 0 0 3px rgba(59,130,246,0.1)",
                    }}
                  >
                    {fa.name}
                  </div>

                  {/* Color swatches */}
                  <div
                    className="hidden sm:flex"
                    style={{
                      alignItems: "center",
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    {COLOR_SWATCHES.map((sw, si) => (
                      <div
                        key={si}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          background: sw.bg,
                          border:
                            si === fa.colorIdx
                              ? `2px solid ${sw.text}`
                              : "1px solid #E2E8F0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "default",
                        }}
                      >
                        {si === fa.colorIdx && (
                          <div
                            style={{
                              width: 6,
                              height: 6,
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
                <div style={{ flex: 1 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
