/* ── Permissions mockup ──────────────────────────────────────────────────
   Mirrors PermissionsEditor. Real component:
   apps/web/src/components/PermissionsEditor.tsx — eight modules grouped
   under Core Operations / Administration, each with a View + Edit toggle
   pair. The mockup shows a representative subset to keep height bounded
   alongside the four trust-signal cards. ── */

type ModuleIcon =
  | "calendar"
  | "repeat"
  | "users"
  | "checkCircle"
  | "barChart"
  | "settings";

const ICONS: Record<ModuleIcon, React.ReactNode> = {
  calendar: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  repeat: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  users: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  checkCircle: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  barChart: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

interface ModuleConfig {
  title: string;
  description: string;
  icon: ModuleIcon;
  view: boolean | "always" | null;
  edit: boolean | null;
}

const CORE_MODULES: ModuleConfig[] = [
  {
    title: "Schedule",
    description: "View and edit the organization-wide shift schedule.",
    icon: "calendar",
    view: "always",
    edit: true,
  },
  {
    title: "Recurring Shifts",
    description: "Manage recurring shift templates, series, and apply to date ranges.",
    icon: "repeat",
    view: true,
    edit: false,
  },
  {
    title: "Staff",
    description: "Access employee profiles, contact info, and certifications.",
    icon: "users",
    view: true,
    edit: true,
  },
  {
    title: "Shift Requests",
    description: "Approve or deny shift pickup and swap requests.",
    icon: "checkCircle",
    view: null,
    edit: true,
  },
];

const ADMIN_MODULES: ModuleConfig[] = [
  {
    title: "Coverage",
    description: "Set staffing minimums and coverage targets.",
    icon: "barChart",
    view: false,
    edit: false,
  },
  {
    title: "Configuration",
    description: "Manage departments, shifts, jobs, indicators, and labels.",
    icon: "settings",
    view: true,
    edit: false,
  },
];

function Toggle({ on, disabled }: { on: boolean; disabled?: boolean }) {
  return (
    <div
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: on ? "var(--color-brand)" : "var(--color-border)",
        position: "relative",
        transition: "background 200ms ease",
        flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          top: 2,
          left: on ? 22 : 2,
          transition: "left 200ms ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
        }}
      />
    </div>
  );
}

function ToggleCell({ value }: { value: boolean | "always" | null }) {
  if (value === null) {
    return (
      <span style={{ fontSize: 13, color: "var(--color-text-faint)" }}>—</span>
    );
  }
  if (value === "always") {
    return <Toggle on disabled />;
  }
  return <Toggle on={value} />;
}

function ModuleRow({ mod }: { mod: ModuleConfig }) {
  const isActive = mod.view === true || mod.view === "always" || mod.edit === true;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 56px 56px",
        gap: 16,
        padding: "14px 20px",
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: isActive ? "var(--color-brand-bg)" : "var(--color-bg-secondary)",
            color: isActive ? "var(--color-brand)" : "var(--color-text-faint)",
          }}
        >
          {ICONS[mod.icon]}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              lineHeight: 1.2,
            }}
          >
            {mod.title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              marginTop: 2,
              lineHeight: 1.4,
            }}
          >
            {mod.description}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <ToggleCell value={mod.view} />
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <ToggleCell value={mod.edit} />
      </div>
    </div>
  );
}

function CategoryHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "10px 20px",
        background: "var(--color-bg)",
        fontSize: 11,
        fontWeight: 700,
        color: "var(--color-text-secondary)",
        letterSpacing: "0.08em",
        textTransform: "uppercase" as const,
      }}
    >
      {label}
    </div>
  );
}

export default function PermissionsMockup() {
  return (
    <div style={{ position: "relative", maxWidth: 460 }}>
      <div
        style={{
          background: "var(--color-surface)",
          borderRadius: 12,
          border: "1px solid var(--color-border)",
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          maxHeight: 460,
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 20px 14px", borderBottom: "1px solid var(--color-border-light)" }}>
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
            }}
          >
            Configure which actions this admin can perform. View Schedule and
            View Staff are always enabled.
          </div>
        </div>

        {/* Column headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 56px 56px",
            gap: 16,
            padding: "10px 20px",
            borderBottom: "1px solid var(--color-border-light)",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--color-text-subtle)",
            textTransform: "uppercase" as const,
            letterSpacing: "0.06em",
          }}
        >
          <div>Module &amp; Access Level</div>
          <div style={{ textAlign: "center" }}>View</div>
          <div style={{ textAlign: "center" }}>Edit</div>
        </div>

        <CategoryHeader label="Core Operations" />
        {CORE_MODULES.map((mod, idx) => (
          <div
            key={mod.title}
            style={{
              borderBottom: idx < CORE_MODULES.length - 1 ? "1px solid var(--color-border-light)" : undefined,
            }}
          >
            <ModuleRow mod={mod} />
          </div>
        ))}

        <CategoryHeader label="Administration" />
        {ADMIN_MODULES.map((mod, idx) => (
          <div
            key={mod.title}
            style={{
              borderBottom: idx < ADMIN_MODULES.length - 1 ? "1px solid var(--color-border-light)" : undefined,
            }}
          >
            <ModuleRow mod={mod} />
          </div>
        ))}
      </div>

      {/* Fade-out gradient at the bottom (suggests the list continues with Org Settings + Dashboard) */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 80,
          background: "linear-gradient(to bottom, rgba(255,255,255,0) 0%, var(--color-surface) 100%)",
          borderRadius: "0 0 12px 12px",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
