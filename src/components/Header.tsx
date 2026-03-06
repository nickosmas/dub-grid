"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export type ViewMode = "schedule" | "staff" | "settings";

interface HeaderProps {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  orgName?: string;
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
}: HeaderProps) {
  const { signOut, isSuperAdmin } = useAuth();
  const router = useRouter();

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.svg" alt="DubGrid" width={30} height={30} />
        <span
          style={{
            color: "var(--color-text-primary)",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "-0.3px",
          }}
        >
          DubGrid
        </span>
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
        {NAV_ITEMS.map((item) => {
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

        {isSuperAdmin && (
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
            Super Admin
          </button>
        )}
      </div>

      {/* User Actions */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <button
          onClick={signOut}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--color-text-muted)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            padding: "5px 10px",
            borderRadius: 6,
          }}
          onMouseOver={(e) =>
            (e.currentTarget.style.color = "var(--color-text-primary)")
          }
          onMouseOut={(e) =>
            (e.currentTarget.style.color = "var(--color-text-muted)")
          }
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
