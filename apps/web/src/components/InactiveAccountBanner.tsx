"use client";

import { usePermissions } from "@/hooks";

const BANNER_HEIGHT = 36;

export default function InactiveAccountBanner() {
  const { isInactive } = usePermissions();

  if (!isInactive) return null;

  return (
    <div
      style={{
        height: BANNER_HEIGHT,
        background: "linear-gradient(135deg, #f59e0b, #d97706)",
        color: "#fff",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontSize: "var(--dg-fs-label, 13px)",
        fontWeight: 600,
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        textAlign: "center",
      }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      Your account is inactive. Ask an admin to reactivate you to regain full access.
    </div>
  );
}
