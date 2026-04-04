"use client";

import { usePermissions, setUserViewActive } from "@/hooks";

const BANNER_HEIGHT = 36;

export default function UserViewBanner() {
  const { isUserViewActive } = usePermissions();

  if (!isUserViewActive) return null;

  return (
      <div
        style={{
          height: BANNER_HEIGHT,
          background: "linear-gradient(135deg, #3b82f6, #2563eb)",
          color: "#fff",
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          fontSize: "var(--dg-fs-label, 13px)",
          fontWeight: 600,
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Viewing as regular user
        </span>
        <button
          onClick={() => setUserViewActive(false)}
          style={{
            background: "rgba(255,255,255,0.2)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.4)",
            borderRadius: 6,
            padding: "3px 10px",
            fontSize: "var(--dg-fs-caption, 12px)",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Exit
        </button>
      </div>
  );
}
