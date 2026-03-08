"use client";

import { useRouter } from "next/navigation";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { useLogout, usePermissions } from "@/hooks";

export type ViewMode = "schedule" | "staff" | "settings";

interface HeaderProps {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  orgName?: string;
  availableViewModes?: ViewMode[];
}

const NAV_ITEMS: { id: ViewMode; label: string; icon?: React.ReactNode }[] = [
  { id: "schedule", label: "Schedule" },
  { id: "staff", label: "Staff" },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export default function Header({
  viewMode,
  onViewChange,
  orgName,
  availableViewModes,
}: HeaderProps) {
  const router = useRouter();
  const { signOutLocal } = useLogout();
  const { isGridmaster } = usePermissions();
  const allowedModes = availableViewModes ?? ["schedule", "staff", "settings"];
  const visibleNavItems = NAV_ITEMS.filter((item) =>
    allowedModes.includes(item.id),
  );

  return (
    <div
      style={{
        background: "#fff",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 56,
        borderBottom: "1px solid var(--color-border)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <DubGridLogo size={30} />
        <DubGridWordmark fontSize={18} color="var(--color-text-primary)" />
        {orgName && (
          <span style={{ color: "var(--color-text-faint)", fontSize: 13 }}>
            / {orgName}
          </span>
        )}
      </div>

      {/* Nav */}
      <div
        style={{
          display: "flex",
          gap: 4,
          alignItems: "center",
          flex: 1,
          justifyContent: "center",
        }}
      >
        {visibleNavItems.map((item) => {
          const active = viewMode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              style={{
                background: active
                  ? "var(--color-border-light)"
                  : "transparent",
                border: "1px solid",
                borderColor: active ? "var(--color-border)" : "transparent",
                color: active
                  ? "var(--color-text-secondary)"
                  : "var(--color-text-muted)",
                borderRadius: 8,
                padding: "5px 14px",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}

        {isGridmaster && (
          <button
            onClick={() => router.push("/admin")}
            style={{
              background: "transparent",
              border: "1px solid var(--color-border)",
              color: "#2563EB",
              borderRadius: 8,
              padding: "5px 14px",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              marginLeft: 8,
            }}
          >
            Gridmaster
          </button>
        )}
      </div>

      {/* User Actions */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <button
          onClick={() => signOutLocal().catch(console.error)}
          style={{
            background: "#fff",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
            borderRadius: 8,
            padding: "5px 12px",
            fontSize: 12,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
