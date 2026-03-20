const PERMISSION_GROUPS = [
  {
    label: "Schedule",
    items: [
      { name: "Edit Shifts", checked: true },
      { name: "Publish Schedule", checked: true },
      { name: "Apply Recurring Schedule", checked: false },
    ],
  },
  {
    label: "Staff",
    items: [
      { name: "View Staff", checked: true },
      { name: "Manage Employees", checked: false },
    ],
  },
  {
    label: "Configuration",
    items: [
      { name: "Manage Focus Areas", checked: true },
      { name: "Manage Shift Codes", checked: true },
      { name: "Manage Indicator Types", checked: false },
      { name: "Manage Custom Labels", checked: false },
    ],
  },
];

export default function PermissionsMockup() {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #CBD5E1",
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)",
        maxWidth: 420,
      }}
    >
      {/* Header */}
      <div style={{ padding: "20px 24px 0" }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#0F172A",
            marginBottom: 4,
          }}
        >
          Admin Permissions
        </div>
        <div
          style={{
            fontSize: 13,
            color: "#64748B",
            lineHeight: 1.4,
          }}
        >
          Configure which actions this admin can perform.
        </div>

        {/* Select All / Clear All */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 14,
            paddingBottom: 14,
            borderBottom: "1px solid #E2E8F0",
          }}
        >
          {["Select All", "Clear All"].map((label) => (
            <span
              key={label}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#64748B",
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #E2E8F0",
                cursor: "default",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Permission groups */}
      <div style={{ padding: "8px 24px 20px" }}>
        {PERMISSION_GROUPS.map((group, gi) => (
          <div key={group.label} style={{ marginTop: gi > 0 ? 18 : 10 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748B",
                letterSpacing: "0.05em",
                textTransform: "uppercase" as const,
                marginBottom: 8,
              }}
            >
              {group.label}
            </div>
            {group.items.map((item) => (
              <label
                key={item.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "5px 0",
                  cursor: "default",
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: item.checked
                      ? "none"
                      : "1.5px solid #CBD5E1",
                    background: item.checked ? "#1B3A2D" : "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {item.checked && (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 13,
                    color: "#1E293B",
                  }}
                >
                  {item.name}
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
