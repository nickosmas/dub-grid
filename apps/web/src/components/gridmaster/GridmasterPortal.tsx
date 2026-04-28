"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePermissions, useLogout, useMediaQuery, MOBILE } from "@/hooks";
import { useAuth } from "@/components/AuthProvider";
import { fetchAccountIdentity } from "@/features/account/client";
import { DubGridLogo } from "@/components/Logo";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import GridmasterDashboard from "@/components/gridmaster/GridmasterDashboard";
import OrganizationDetail from "@/components/gridmaster/OrganizationDetail";
import OrganizationSetupWizard from "@/components/gridmaster/OrganizationSetupWizard";

import AllUsersView from "@/components/gridmaster/AllUsersView";
import AuditLogView from "@/components/gridmaster/AuditLogView";
import EnhancedImpersonation from "@/components/gridmaster/EnhancedImpersonation";
import ImpersonationHistory from "@/components/gridmaster/ImpersonationHistory";
import {
  fetchGridmasterDashboardData,
  type TenantStats,
} from "@/features/gridmaster/client";
import type { Organization } from "@/types";

type GridmasterView =
  | "dashboard"
  | "all-users"
  | "audit-log"
  | "organization"
  | "impersonation"
  | "impersonation-history"
  | "create-organization";

// ── Sidebar nav items ────────────────────────────────────────────────────────

const SIDEBAR_MENU_BTN_CLASS = "h-9 data-[active=true]:bg-[var(--color-brand-bg)] data-[active=true]:text-[var(--color-brand)] data-[active=true]:ring-[var(--color-brand-border)] transition-all ease-in-out duration-150";
const SIDEBAR_GROUP_LABEL_CLASS = "text-[10px] font-bold tracking-[0.08em] uppercase text-[var(--color-text-faint)] px-3 pb-0";

// ── Icons (inline SVGs) ──────────────────────────────────────────────────────

const DashboardIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);


const AuditIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
  </svg>
);

const ImpersonateIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const PlusIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const UsersIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const HistoryIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

// ── Organization search combobox (header) ────────────────────────────────────

function OrgSearchCombobox({
  organizations,
  stats,
  selectedOrg,
  onSelect,
}: {
  organizations: Organization[];
  stats: Map<string, TenantStats>;
  selectedOrg: Organization | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return organizations.filter((c) =>
      !q || c.name.toLowerCase().includes(q) || (c.slug ?? "").toLowerCase().includes(q)
    );
  }, [organizations, query]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {selectedOrg && (
          <span
            style={{
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 600,
              background: "var(--color-bg-secondary)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: "3px 10px",
              color: "var(--color-text-primary)",
              whiteSpace: "nowrap",
              maxWidth: 160,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {selectedOrg.name}
          </span>
        )}
        <input
          type="text"
          placeholder="Search organizations…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); } }}
          className="dg-input"
          style={{ width: "100%", maxWidth: 280, fontSize: "var(--dg-fs-label)" }}
        />
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: 380,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--dg-radius-lg)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{
            padding: "8px 14px",
            fontSize: "var(--dg-fs-footnote)",
            fontWeight: 700,
            color: "var(--color-text-subtle)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            borderBottom: "1px solid var(--color-border-light)",
          }}>
            {query ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""}` : `All Organizations (${organizations.length})`}
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "20px 14px", fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)", textAlign: "center" }}>
                No matching organizations
              </div>
            ) : (
              filtered.map((c) => {
                const empCount = stats.get(c.id)?.employeeCount ?? 0;
                const isArchived = !!c.archivedAt;
                const isActive = selectedOrg?.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => { onSelect(c.id); setOpen(false); setQuery(""); }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                      padding: "8px 14px",
                      background: isActive ? "var(--color-bg-secondary)" : "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--color-border-light)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                      opacity: isArchived ? 0.5 : 1,
                      transition: "background 150ms ease",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-bg-secondary)"; }}
                    onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </div>
                      {c.slug && (
                        <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", fontFamily: "var(--font-dm-mono), monospace", marginTop: 1 }}>
                          {c.slug}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 10 }}>
                      {isArchived && (
                        <span style={{ fontSize: "var(--dg-fs-badge)", fontWeight: 600, color: "var(--color-text-subtle)", background: "var(--color-bg-secondary)", padding: "1px 6px", borderRadius: 4, textTransform: "uppercase" }}>
                          Archived
                        </span>
                      )}
                      <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-subtle)", background: "var(--color-bg-secondary)", padding: "1px 8px", borderRadius: 4 }}>
                        {empCount}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main portal ─────────────────────────────────────────────────────────────

export default function GridmasterPortal() {
  const { isGridmaster, isLoading: permLoading } = usePermissions();
  const { signOutLocal } = useLogout();
  const { user: authUser } = useAuth();
  const isMobile = useMediaQuery(MOBILE);
  const [signingOut, setSigningOut] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  // Fetch user name for header identity
  useEffect(() => {
    if (!authUser) return;
    const cached = sessionStorage.getItem("dg_user_name");
    if (cached) { setUserName(cached); return; }
    let cancelled = false;
    void (async () => {
      try {
        const identity = await fetchAccountIdentity();
        if (cancelled) return;
        const name = identity.displayName || authUser.email?.split("@")[0] || null;
        setUserName(name);
        if (name) sessionStorage.setItem("dg_user_name", name);
      } catch {
        if (cancelled) return;
        const fallbackName = authUser.email?.split("@")[0] || null;
        setUserName(fallbackName);
      }
    })();
    return () => { cancelled = true; };
  }, [authUser]);

  const displayName = userName || "Gridmaster";
  const initials = userName
    ? userName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "GM";

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    await signOutLocal("/login");
  }, [signOutLocal]);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [stats, setStats] = useState<Map<string, TenantStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<GridmasterView>("dashboard");
  const [impersonateTargetId, setImpersonateTargetId] = useState<string | undefined>();
  const [impersonateOrgId, setImpersonateOrgId] = useState<string | undefined>();

  // User menu dropdown state
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchGridmasterDashboardData();
      setOrganizations(data.organizations);
      const map = new Map<string, TenantStats>();
      for (const s of data.stats) map.set(s.orgId, s);
      setStats(map);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permLoading || !isGridmaster) return;
    loadData();
  }, [permLoading, isGridmaster, loadData]);

  // ── Nav item config (must be before early returns to satisfy Rules of Hooks) ──

  const navGroups = useMemo(() => [
    {
      id: "navigation",
      label: "Navigation",
      items: [
        { key: "dashboard" as GridmasterView, label: "Dashboard", icon: DashboardIcon, onClick: () => { setView("dashboard"); setSelectedId(null); } },
        { key: "all-users" as GridmasterView, label: "All Users", icon: UsersIcon, onClick: () => { setView("all-users"); setSelectedId(null); } },
        { key: "audit-log" as GridmasterView, label: "Audit Log", icon: AuditIcon, onClick: () => { setView("audit-log"); setSelectedId(null); } },
      ],
    },
    {
      id: "actions",
      label: "Actions",
      items: [
        { key: "create-organization" as GridmasterView, label: "New Organization", icon: PlusIcon, onClick: () => { setView("create-organization"); setSelectedId(null); } },
      ],
    },
    {
      id: "tools",
      label: "Tools",
      items: [
        { key: "impersonation" as GridmasterView, label: "Impersonation", icon: ImpersonateIcon, onClick: () => { setView("impersonation"); setSelectedId(null); setImpersonateTargetId(undefined); setImpersonateOrgId(undefined); } },
        { key: "impersonation-history" as GridmasterView, label: "History", icon: HistoryIcon, onClick: () => { setView("impersonation-history"); setSelectedId(null); } },
      ],
    },
  ], []);

  // ── Loading / denied states ──────────────────────────────────────────────

  if (permLoading || signingOut || (isGridmaster && loading)) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "grid", placeItems: "center" }}>
        <span style={{ color: "var(--color-text-muted)", fontSize: "var(--dg-fs-body-sm)" }}>Loading…</span>
      </div>
    );
  }

  if (!isGridmaster) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 520 }}>
          <h1 style={{ marginBottom: 8, fontSize: "var(--dg-fs-section-title)", color: "var(--color-danger)" }}>Access denied</h1>
          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
            The gridmaster command center is restricted to gridmaster accounts.
          </p>
        </div>
      </div>
    );
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const totalUsers = Array.from(stats.values()).reduce((n, s) => n + s.userCount, 0);
  const totalEmployees = Array.from(stats.values()).reduce((n, s) => n + s.employeeCount, 0);

  const selectedOrg = selectedId ? organizations.find((c) => c.id === selectedId) ?? null : null;

  function selectOrg(id: string) {
    setSelectedId(id);
    setView("organization");
  }

  function handleImpersonate(userId: string, orgId?: string) {
    setImpersonateTargetId(userId);
    setImpersonateOrgId(orgId);
    setView("impersonation");
  }

  function handleOrgCreated(org: Organization) {
    setOrganizations((prev) => [...prev, org].sort((a, b) => a.name.localeCompare(b.name)));
    selectOrg(org.id);
  }

  function handleOrgUpdated(updated: Organization) {
    setOrganizations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header
        style={{
          height: 56,
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: isMobile ? "0 12px" : "0 20px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexShrink: 0 }}>
          <DubGridLogo size={28} />
          <span style={{ fontSize: "var(--dg-fs-body)", fontWeight: 700, color: "var(--color-text-primary)" }}>
            Gridmaster
          </span>
          {!isMobile && (
            <span
              style={{
                fontSize: "var(--dg-fs-badge)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--color-text-inverse)",
                background: "var(--color-text-primary)",
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              Command Center
            </span>
          )}
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: isMobile ? "flex-end" : "center", marginLeft: isMobile ? 8 : 0 }}>
          <OrgSearchCombobox
            organizations={organizations}
            stats={stats}
            selectedOrg={selectedOrg}
            onSelect={selectOrg}
          />
        </div>
        {!isMobile && (
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
                minHeight: 44,
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
                  Gridmaster
                </div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: "transform 150ms ease", transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {menuOpen && (
              <div className="dg-menu" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 200 }}>
                <button
                  className="dg-menu-item"
                  onClick={() => { setMenuOpen(false); window.location.href = "/profile"; }}
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
        )}
      </header>

      {/* Mobile section chips */}
      {isMobile && (
        <nav className="dg-mobile-section-bar" aria-label="Gridmaster navigation">
          {([
            { key: "dashboard", label: "Dashboard" },
            { key: "all-users", label: "Users" },
            { key: "audit-log", label: "Audit" },
            { key: "create-organization", label: "New Org" },
            { key: "impersonation", label: "Impersonate" },
            { key: "impersonation-history", label: "History" },
          ] as { key: GridmasterView; label: string }[]).map((item) => (
            <button
              key={item.key}
              className={`dg-mobile-section-chip${view === item.key ? " active" : ""}`}
              onClick={() => { setView(item.key); setSelectedId(null); if (item.key === "impersonation") { setImpersonateTargetId(undefined); setImpersonateOrgId(undefined); } }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      {/* Body: sidebar + content */}
      <SidebarProvider defaultOpen={true} style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar (desktop only) */}
        {!isMobile && (
          <Sidebar collapsible="icon" className="border-r border-[var(--color-border)] bg-[var(--color-surface)]" style={{ top: 56, height: "calc(100dvh - 56px)" }}>
            <SidebarContent className="pt-2 overscroll-contain">
              {navGroups.map((group) => (
                <SidebarGroup key={group.id}>
                  <SidebarGroupLabel className={SIDEBAR_GROUP_LABEL_CLASS}>
                    {group.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => (
                        <SidebarMenuItem key={item.key}>
                          <SidebarMenuButton
                            isActive={view === item.key}
                            tooltip={item.label}
                            onClick={item.onClick}
                            className={SIDEBAR_MENU_BTN_CLASS}
                          >
                            <span className={view === item.key ? "text-[var(--color-brand)] flex shrink-0 items-center justify-center transition-colors" : "text-[var(--color-text-faint)] flex shrink-0 items-center justify-center transition-colors"}>
                              {item.icon}
                            </span>
                            <span className="font-semibold">{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>
            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <GridmasterSidebarCollapseButton />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          </Sidebar>
        )}

        {/* Main content */}
        <main aria-label="Gridmaster content" style={{ flex: 1, overflow: "auto", padding: isMobile ? 16 : 24 }}>
          {error && (
            <div
              style={{
                padding: "12px 16px",
                background: "var(--color-danger-bg)",
                color: "var(--color-danger)",
                borderRadius: "var(--dg-radius-lg)",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
                marginBottom: 20,
              }}
            >
              {error}
            </div>
          )}

          {view === "dashboard" && (
            <GridmasterDashboard
              organizations={organizations}
              stats={stats}
              totalUsers={totalUsers}
              totalEmployees={totalEmployees}
              onSelectOrg={selectOrg}
              onCreateOrg={() => { setView("create-organization"); setSelectedId(null); }}
            />
          )}

          {view === "all-users" && (
            <AllUsersView
              organizations={organizations}
              onNavigateToOrg={selectOrg}
              onImpersonate={handleImpersonate}
            />
          )}

          {view === "audit-log" && (
            <AuditLogView />
          )}

          {view === "create-organization" && (
            <OrganizationSetupWizard
              onCreated={handleOrgCreated}
              onCancel={() => setView("dashboard")}
            />
          )}

          {view === "organization" && selectedOrg && (
            <>
              <button
                onClick={() => { setView("dashboard"); setSelectedId(null); }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "var(--dg-fs-label)",
                  color: "var(--color-text-muted)",
                  padding: "0 0 12px",
                  transition: "color 150ms ease",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-text-primary)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                All Organizations
              </button>
              <OrganizationDetail
                organization={selectedOrg}
                stats={stats.get(selectedOrg.id)}
                onOrgUpdated={handleOrgUpdated}
                onImpersonate={handleImpersonate}
              />
            </>
          )}

          {view === "impersonation" && (
            <EnhancedImpersonation
              organizations={organizations}
              initialOrgId={impersonateOrgId}
              initialTargetId={impersonateTargetId}
            />
          )}

          {view === "impersonation-history" && (
            <ImpersonationHistory />
          )}
        </main>
      </SidebarProvider>
    </div>
  );
}

// ── Sidebar collapse button (needs useSidebar context) ────────────────────

function GridmasterSidebarCollapseButton() {
  const { open, toggleSidebar } = useSidebar();

  // Keyboard shortcut: 'b' to toggle sidebar (matches main app convention)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "b" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement).isContentEditable) return;
        toggleSidebar();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  return (
    <SidebarMenuButton
      onClick={toggleSidebar}
      tooltip={open ? "Collapse Menu (b)" : "Expand Menu (b)"}
      className="h-9 text-[var(--color-text-faint)] hover:text-black transition-all ease-in-out duration-150"
    >
      <span className="flex shrink-0 items-center justify-center">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>
          <polyline points="13 17 18 12 13 7" />
          <polyline points="6 17 11 12 6 7" />
        </svg>
      </span>
      <span className="font-semibold ml-2">Collapse Menu</span>
    </SidebarMenuButton>
  );
}
