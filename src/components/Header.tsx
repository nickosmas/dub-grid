"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { useLogout, usePermissions, useMediaQuery, MOBILE, TABLET } from "@/hooks";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import MobileNavSheet from "@/components/MobileNavSheet";

const NAV_ITEMS: { id: string; href: string; label: string; icon?: React.ReactNode }[] = [
  {
    id: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
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
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: "schedule",
    href: "/schedule",
    label: "Schedule",
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
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: "staff",
    href: "/staff",
    label: "Staff",
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
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: "settings",
    href: "/settings",
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
  super_admin: "Super Admin",
  admin: "Admin",
  scheduler: "Scheduler",
  supervisor: "Supervisor",
  user: "User",
};

/* ── Nav icons for mobile drawer ─────────────────────────── */
const NAV_ICONS: Record<string, React.ReactNode> = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  schedule: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  staff: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

/* ── Hamburger Icon ──────────────────────────────────────── */
function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="var(--color-text-primary)"
      strokeWidth="1.8"
      strokeLinecap="round"
      style={{ transition: "transform 150ms ease" }}
    >
      {open ? (
        <>
          <line x1="4" y1="4" x2="16" y2="16" />
          <line x1="16" y1="4" x2="4" y2="16" />
        </>
      ) : (
        <>
          <line x1="3" y1="5" x2="17" y2="5" />
          <line x1="3" y1="10" x2="17" y2="10" />
          <line x1="3" y1="15" x2="17" y2="15" />
        </>
      )}
    </svg>
  );
}

/* ── Header ──────────────────────────────────────────────── */
interface HeaderProps {
  orgName?: string;
}

export default function Header({ orgName }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOutLocal } = useLogout();
  const { isGridmaster, role, canViewStaff, canManageOrg, isSuperAdmin } = usePermissions();
  const isMobile = useMediaQuery(MOBILE);
  const isTablet = useMediaQuery(TABLET);

  const activeTab = pathname.startsWith("/dashboard")
    ? "dashboard"
    : pathname.startsWith("/staff")
      ? "staff"
      : pathname.startsWith("/settings")
        ? "settings"
        : "schedule";

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.id === "dashboard") return true;
    if (item.id === "schedule") return true;
    if (item.id === "staff") return canViewStaff;
    if (item.id === "settings") return canManageOrg || isSuperAdmin || isGridmaster;
    return false;
  });

  const { user: authUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Hydrate cached name from sessionStorage after mount
  useEffect(() => {
    const cached = sessionStorage.getItem("dg_user_name");
    if (cached) setUserName(cached);
  }, []);

  // NOTE: drawer is NOT auto-closed on route change — the drill-down
  // navigation needs the sheet to stay open while switching pages.

  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    void (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", authUser.id)
        .single();
      if (cancelled) return;
      const first = profile?.first_name?.trim() || "";
      const last = profile?.last_name?.trim() || "";
      const full = [first, last].filter(Boolean).join(" ");
      const name = full || authUser.email?.split("@")[0] || null;
      setUserName(name);
      if (name) sessionStorage.setItem("dg_user_name", name);
    })();
    return () => { cancelled = true; };
  }, [authUser]);

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
  const roleLabel = ROLE_LABELS[role] ?? "User";

  const handleSignOut = useCallback(() => {
    signOutLocal().catch(console.error);
  }, [signOutLocal]);

  /* ── Mobile Header ─────────────────────────────────────── */
  if (isMobile) {
    return (
      <>
        <div
          style={{
            background: "var(--color-surface)",
            padding: "0 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 56,
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          {/* Logo + Org Name */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
            <DubGridLogo size={26} />
            {orgName && (
              <>
                <span style={{ color: "var(--color-border)", fontSize: "var(--dg-fs-body)", fontWeight: 300, userSelect: "none", flexShrink: 0 }}>
                  |
                </span>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                  }}
                  title={orgName}
                >
                  {orgName}
                </span>
              </>
            )}
          </div>

          {/* Hamburger */}
          <button
            onClick={() => setDrawerOpen((o) => !o)}
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              background: "transparent",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
            }}
          >
            <HamburgerIcon open={drawerOpen} />
          </button>
        </div>

        <MobileNavSheet
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          mainNavItems={visibleNavItems.map((item) => ({
            ...item,
            icon: NAV_ICONS[item.id] || item.icon || <span />,
          }))}
          activeTab={activeTab}
          isGridmaster={isGridmaster}
          displayName={displayName}
          initials={initials}
          roleLabel={roleLabel}
          onSignOut={handleSignOut}
        />
      </>
    );
  }

  /* ── Desktop / Tablet Header ───────────────────────────── */
  return (
    <div
      style={{
        background: "var(--color-surface)",
        padding: isTablet ? "0 16px" : "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 56,
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {/* Logo + Org Anchor */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexShrink: 0 }}>
        <DubGridLogo size={30} />
        <DubGridWordmark fontSize={18} color="var(--color-text-primary)" />
        {orgName && (
          <>
            <span style={{ color: "var(--color-border)", fontSize: "var(--dg-fs-title)", fontWeight: 300, userSelect: "none" }}>
              |
            </span>
            <span
              style={{
                color: "var(--color-text-muted)",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: isTablet ? 160 : 200,
              }}
              title={orgName}
            >
              {orgName}
            </span>
          </>
        )}
      </div>

      {/* Nav Tabs */}
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
          const active = activeTab === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`dg-nav-tab${active ? " active" : ""}`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}

        {isGridmaster && (
          <button
            onClick={() => router.push("/gridmaster")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: "1px solid var(--color-border)",
              color: "var(--color-link)",
              borderRadius: 8,
              padding: "5px 14px",
              fontSize: "var(--dg-fs-label)",
              cursor: "pointer",
              fontWeight: 600,
              marginLeft: 8,
              fontFamily: "inherit",
              transition: "background 150ms ease, border-color 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--color-info-bg)";
              e.currentTarget.style.borderColor = "var(--color-info-border)";
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
            background: menuOpen ? "var(--color-bg-secondary)" : "transparent",
            border: "1px solid " + (menuOpen ? "var(--color-border)" : "transparent"),
            borderRadius: 8,
            padding: "4px 8px 4px 4px",
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "background 150ms ease, border-color 150ms ease",
          }}
          onMouseEnter={(e) => {
            if (!menuOpen) {
              e.currentTarget.style.background = "var(--color-bg-secondary)";
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
          <div style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--color-brand)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "var(--dg-fs-footnote)",
            fontWeight: 700,
            color: "var(--color-text-inverse)",
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.2, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {displayName}
            </div>
            <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", lineHeight: 1.2 }}>
              {roleLabel}
            </div>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: "transform 150ms ease", transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {menuOpen && (
          <div
            className="dg-menu"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              zIndex: 200,
            }}
          >
            <button
              className="dg-menu-item"
              onClick={() => { setMenuOpen(false); router.push("/profile"); }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Profile
            </button>
            <div className="dg-menu-divider" />
            <button
              className="dg-menu-item dg-menu-item--danger"
              onClick={() => { setMenuOpen(false); handleSignOut(); }}
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
