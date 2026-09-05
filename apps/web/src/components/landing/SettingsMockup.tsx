/* ── Settings mockup ──────────────────────────────────────────────────
   Mirrors Settings → General → Labels. Real components:
   apps/web/src/components/settings/SettingsPage.tsx (page-title chrome)
   + apps/web/src/components/settings/OrganizationLabels.tsx
   (three label fields). Headerless SectionCard with right-aligned
   Save/Discard. ── */

const FIELDS = [
  {
    label: "FOCUS AREAS LABEL",
    value: "Wings",
    placeholder: "Focus Areas",
    helper: "e.g. Focus Areas, Departments, Units",
    dirty: true,
  },
  {
    label: "CERTIFICATIONS LABEL",
    value: "Designations",
    placeholder: "Certifications",
    helper: "e.g. Certifications, Designations",
    dirty: false,
  },
  {
    label: "ROLES LABEL",
    value: "Roles",
    placeholder: "Roles",
    helper: "e.g. Responsibilities, Positions",
    dirty: false,
  },
];

const ANY_DIRTY = FIELDS.some((f) => f.dirty);

export default function SettingsMockup() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Page-title chrome (matches SettingsPage.tsx h1 + description) */}
      <div style={{ marginBottom: 24 }}>
        <h3
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "var(--dg-color-text-primary)",
            margin: 0,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
          }}
        >
          Labels
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "var(--dg-color-text-muted)",
            margin: "5px 0 0",
            lineHeight: 1.5,
          }}
        >
          Customize the terminology used in your organization. For example, rename &lsquo;Focus
          Areas&rsquo; to &lsquo;Wings&rsquo; or &lsquo;Units&rsquo;.
        </p>
      </div>

      {/* SectionCard (headerless) */}
      <div
        style={{
          background: "var(--dg-color-surface)",
          borderRadius: "var(--dg-radius-lg)",
          border: "1px solid var(--dg-color-border)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          padding: 20,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            {FIELDS.map((field) => (
              <div key={field.label}>
                {/* Field label — matches labelStyle: 11px 700 uppercase */}
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--dg-color-text-subtle)",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase" as const,
                    marginBottom: 6,
                  }}
                >
                  {field.label}
                </div>

                {/* Input — matches dg-input: 38px tall, radius 6, fontSize 13, padding 0 12px */}
                <div
                  style={{
                    height: 38,
                    display: "flex",
                    alignItems: "center",
                    fontSize: 13,
                    fontWeight: 500,
                    padding: "0 12px",
                    border: `1px solid ${field.dirty ? "var(--dg-color-border-focus)" : "var(--dg-color-border)"}`,
                    borderRadius: "var(--dg-radius-sm)",
                    color: "var(--dg-color-text-secondary)",
                    background: "var(--dg-color-surface)",
                    boxShadow: field.dirty ? "0 0 0 3px rgba(59,130,246,0.15)" : undefined,
                  }}
                >
                  {field.value}
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: "var(--dg-color-text-muted)",
                    marginTop: 4,
                  }}
                >
                  {field.helper}
                </div>
              </div>
            ))}
          </div>

          {/* Action row — right-aligned, no separator. Discard only shows when dirty. */}
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              justifyContent: "flex-end",
            }}
          >
            {ANY_DIRTY && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 38,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "0 16px",
                  border: "1px solid var(--dg-color-border)",
                  borderRadius: "var(--dg-radius-sm)",
                  color: "var(--dg-color-text-secondary)",
                  background: "transparent",
                }}
              >
                Discard
              </div>
            )}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 38,
                fontSize: 13,
                fontWeight: 600,
                padding: "0 16px",
                borderRadius: "var(--dg-radius-sm)",
                color: "var(--dg-color-text-inverse)",
                background: "var(--dg-color-brand)",
              }}
            >
              Save
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
