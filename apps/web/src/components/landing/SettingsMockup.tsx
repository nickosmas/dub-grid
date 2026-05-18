/* ── Settings mockup ──────────────────────────────────────────────────
   Mirrors the "Custom Labels" section under Settings → Organization. Real
   component: apps/web/src/components/settings/OrganizationLabels.tsx —
   three label fields (Focus Areas, Certifications, Roles) plus a
   save/discard action row. ── */

const FIELDS = [
  {
    label: "FOCUS AREAS LABEL",
    value: "Wings",
    helper: "e.g. Focus Areas, Departments, Units",
    note: null as string | null,
    dirty: true,
  },
  {
    label: "CERTIFICATIONS LABEL",
    value: "Designations",
    helper: "e.g. Certifications, Designations",
    note: null,
    dirty: false,
  },
  {
    label: "ROLES LABEL",
    value: "Roles",
    helper: "e.g. Responsibilities, Positions",
    note: null,
    dirty: false,
  },
];

export default function SettingsMockup() {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        borderRadius: 12,
        border: "1px solid var(--color-border)",
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      {/* Section header */}
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

      {/* Fields */}
      <div style={{ padding: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            rowGap: 18,
          }}
        >
          {FIELDS.map((field) => (
            <div key={field.label}>
              {/* Field label — matches labelStyle: 11px 700 uppercase */}
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

              {field.note && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    margin: "0 0 6px",
                  }}
                >
                  {field.note}
                </div>
              )}

              {/* Input — matches dg-input: borderRadius 10px, padding 7px 12px, fontSize 13px */}
              <div
                style={{
                  fontSize: 13,
                  padding: "7px 12px",
                  border: `1px solid ${field.dirty ? "var(--color-border-focus)" : "var(--color-border)"}`,
                  borderRadius: 10,
                  color: "var(--color-text-secondary)",
                  background: "var(--color-surface)",
                  boxShadow: field.dirty ? "0 0 0 3px rgba(59,130,246,0.15)" : undefined,
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

        {/* Action row — Save / Discard, right-aligned, matches EditorActionRow */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            justifyContent: "flex-end",
            marginTop: 20,
            paddingTop: 16,
            borderTop: "1px solid var(--color-border-light)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "7px 14px",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              color: "var(--color-text-secondary)",
              background: "var(--color-surface)",
            }}
          >
            Discard
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "7px 14px",
              border: "1px solid var(--color-brand)",
              borderRadius: 10,
              color: "#fff",
              background: "var(--color-brand)",
            }}
          >
            Save
          </div>
        </div>
      </div>
    </div>
  );
}
