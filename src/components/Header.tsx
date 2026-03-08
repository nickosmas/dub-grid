"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { useLogout, usePermissions } from "@/hooks";
import { supabase } from "@/lib/supabase";

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

const ROLE_LABELS: Record<string, string> = {
  gridmaster: "Gridmaster",
  admin: "Admin",
  scheduler: "Scheduler",
  supervisor: "Supervisor",
  user: "User",
};

export default function Header({
  viewMode,
  onViewChange,
  orgName,
  availableViewModes,
}: HeaderProps) {
  const router = useRouter();
  const { signOutLocal } = useLogout();
  const { isGridmaster, role } = usePermissions();
  const allowedModes = availableViewModes ?? ["schedule", "staff", "settings"];
  const visibleNavItems = NAV_ITEMS.filter((item) =>
    allowedModes.includes(item.id),
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("dg_user_name") || null;
    }
    return null;
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", user.id)
          .single();
        const first = profile?.first_name?.trim() || "";
        const last = profile?.last_name?.trim() || "";
        const full = [first, last].filter(Boolean).join(" ");
        const name = full || user.email?.split("@")[0] || null;
        setUserName(name);
        if (name) sessionStorage.setItem("dg_user_name", name);
      }
    })();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const displayName = userName || "Account";
  const initials = userName
    ? userName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

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
        boxShadow: "var(--shadow-raised)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Logo + Org Anchor — permanent, unbreakable group */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexShrink: 0 }}>
        <DubGridLogo size={30} />
        <DubGridWordmark fontSize={18} color="var(--color-text-primary)" />
        {orgName && (
          <>
            <span style={{ color: "var(--color-border)", fontSize: 18, fontWeight: 300, userSelect: "none" }}>
              |
            </span>
            <span
              style={{
                color: "var(--color-text-muted)",
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 200,
              }}
              title={orgName}
            >
              {orgName}
            </span>
          </>
        )}
      </div>

      {/* Nav Tabs — centered in the full header */}
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
              className={`dg-nav-tab${active ? " active" : ""}`}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}

        {/* Gridmaster badge — only rendered if role = gridmaster */}
        {isGridmaster && (
          <button
            onClick={() => router.push("/admin")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: "1px solid var(--color-border)",
              color: "#2563EB",
              borderRadius: 8,
              padding: "5px 14px",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 600,
              marginLeft: 8,
              fontFamily: "inherit",
              transition: "background 150ms ease, border-color 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#EFF6FF";
              e.currentTarget.style.borderColor = "#BFDBFE";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "var(--color-border)";
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Gridmaster
          </button>
        )}
      </div>

      {/* User Menu */}
      <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: menuOpen ? "var(--color-surface-overlay)" : "transparent",
            border: "1px solid " + (menuOpen ? "var(--color-border)" : "transparent"),
            borderRadius: 8,
            padding: "4px 8px 4px 4px",
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "background 150ms ease, border-color 150ms ease",
          }}
          onMouseEnter={(e) => {
            if (!menuOpen) {
              e.currentTarget.style.background = "var(--color-surface-overlay)";
              e.currentTarget.style.borderColor = "var(--color-border)";
            }
          }}
          onMouseLeave={(e) => {
            if (!menuOpen) {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "transparent";
            }
          }}
        >
          {/* Avatar circle */}
          <div style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--color-accent-gradient)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.2, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {displayName}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.2 }}>
              {ROLE_LABELS[role] ?? "User"}
            </div>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: "transform 150ms ease", transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {menuOpen && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            boxShadow: "var(--shadow-float)",
            minWidth: 160,
            zIndex: 200,
            overflow: "hidden",
          }}>
            <button
              onClick={() => { setMenuOpen(false); router.push("/profile"); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "9px 14px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: "var(--color-text-primary)",
                fontFamily: "inherit",
                textAlign: "left",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-overlay)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Profile
            </button>
            <div style={{ height: 1, background: "var(--color-border)" }} />
            <button
              onClick={() => { setMenuOpen(false); signOutLocal().catch(console.error); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "9px 14px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: "var(--color-danger)",
                fontFamily: "inherit",
                textAlign: "left",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-danger-bg)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
