const PERMISSION_GROUPS = [
  {
    label: "Schedule",
    items: [
      { name: "Edit Shifts", on: true },
      { name: "Publish Schedule", on: true },
      { name: "Apply Recurring Schedule", on: false },
      { name: "Approve Shift Requests", on: false },
    ],
  },
  {
    label: "Notes",
    items: [
      { name: "Edit Notes", on: true },
    ],
  },
  {
    label: "Recurring Shifts",
    items: [
      { name: "Manage Recurring Shifts", on: false },
      { name: "Manage Shift Series", on: false },
    ],
  },
  {
    label: "Staff",
    items: [
      { name: "View Staff", on: true },
      { name: "Manage Employees", on: false },
    ],
  },
  {
    label: "Configuration",
    items: [
      { name: "Manage Focus Areas", on: true },
      { name: "Manage Shift Codes", on: true },
      { name: "Manage Indicator Types", on: false },
      { name: "Manage Custom Labels", on: false },
      { name: "Manage Coverage Requirements", on: false },
    ],
  },
];

/* ── Toggle switch — exact copy from Toolbar.tsx ToggleSwitch ── */
function Toggle({ on }: { on: boolean }) {
  return (
    <div
      style={{
        width: 32,
        height: 18,
        borderRadius: 9,
        background: on ? "var(--color-border-focus)" : "var(--color-border)",
        position: "relative",
        transition: "background 150ms ease",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          transition: "left 150ms ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
        }}
      />
    </div>
  );
}

export default function PermissionsMockup() {
  return (
    <div style={{ position: "relative", maxWidth: 420 }}>
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid var(--color-border)",
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          /* Cap height to match the 2×2 trust cards grid beside it */
          maxHeight: 380,
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 0" }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              marginBottom: 4,
            }}
          >
            Admin Permissions
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--color-text-muted)",
              lineHeight: 1.4,
              marginBottom: 16,
            }}
          >
            Configure which actions this admin can perform.{" "}
            <em style={{ fontStyle: "italic" }}>View Schedule</em> is always
            enabled.
          </div>

          {/* Select All / Clear All — .dg-btn-ghost style */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 16,
            }}
          >
            {["Select All", "Clear All"].map((label) => (
              <span
                key={label}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--color-text-muted)",
                  padding: "6px 10px",
                  borderRadius: 8,
                  cursor: "default",
                  background: "transparent",
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Permission groups */}
        <div style={{ padding: "0 24px" }}>
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--color-text-subtle)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase" as const,
                  marginBottom: 8,
                }}
              >
                {group.label}
              </div>
              {group.items.map((item) => (
                <div
                  key={item.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "6px 0",
                    cursor: "default",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {item.name}
                  </span>
                  <Toggle on={item.on} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Fade-out gradient at the bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 80,
          background: "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 100%)",
          borderRadius: "0 0 12px 12px",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
