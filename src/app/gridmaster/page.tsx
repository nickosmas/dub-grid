"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePermissions, useLogout, useMediaQuery, MOBILE } from "@/hooks";
import { DubGridLogo } from "@/components/Logo";
import GridmasterDashboard from "@/components/gridmaster/GridmasterDashboard";
import OrganizationDetail from "@/components/gridmaster/OrganizationDetail";
import CreateOrganizationForm from "@/components/gridmaster/CreateOrganizationForm";
import AllUsersView from "@/components/gridmaster/AllUsersView";
import AuditLogView from "@/components/gridmaster/AuditLogView";
import EnhancedImpersonation from "@/components/gridmaster/EnhancedImpersonation";
import {
  fetchAllOrganizations,
  fetchTenantStats,
  type TenantStats,
} from "@/lib/db";
import type { Organization } from "@/types";

type GridmasterView =
  | "dashboard"
  | "all-users"
  | "audit-log"
  | "organization"
  | "impersonation"
  | "create-organization";

// ── Sidebar link (same pattern as StaffView / SettingsPage) ──────────────────

function SidebarLink({
  label,
  icon,
  active,
  onClick,
  badge,
  dimmed,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: string | number;
  dimmed?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "7px 12px",
        background: active
          ? "var(--color-bg-secondary)"
          : hovered
            ? "var(--color-border-light)"
            : "transparent",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: "var(--dg-fs-label)",
        fontWeight: active ? 600 : 500,
        color: active
          ? "var(--color-text-primary)"
          : hovered
            ? "var(--color-text-primary)"
            : "var(--color-text-muted)",
        opacity: dimmed ? 0.5 : 1,
        textAlign: "left",
        fontFamily: "inherit",
        transition: "background 150ms ease, color 150ms ease",
        position: "relative",
      }}
    >
      <span
        style={{
          color: active ? "var(--color-text-secondary)" : "var(--color-text-muted)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      {badge !== undefined && (
        <span
          style={{
            fontSize: "var(--dg-fs-footnote)",
            fontWeight: 600,
            color: "var(--color-text-subtle)",
            flexShrink: 0,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Icons (inline SVGs) ──────────────────────────────────────────────────────

const DashboardIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);

const UsersIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
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
            borderRadius: 10,
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

// ── Main page ────────────────────────────────────────────────────────────────

export default function GridmasterPage() {
  const { isGridmaster, isLoading: permLoading } = usePermissions();
  const { signOutLocal } = useLogout();
  const isMobile = useMediaQuery(MOBILE);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [stats, setStats] = useState<Map<string, TenantStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<GridmasterView>("dashboard");
  const [impersonateTargetId, setImpersonateTargetId] = useState<string | undefined>();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("dg-sidebar-collapsed-gridmaster") === "true";
  });
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("dg-sidebar-collapsed-gridmaster", String(next));
      return next;
    });
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [orgsData, statsData] = await Promise.all([
        fetchAllOrganizations(),
        fetchTenantStats(),
      ]);
      setOrganizations(orgsData);
      const map = new Map<string, TenantStats>();
      for (const s of statsData) map.set(s.orgId, s);
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

  // ── Loading / denied states ──────────────────────────────────────────────

  if (permLoading || (isGridmaster && loading)) {
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

  function handleImpersonate(userId: string) {
    setImpersonateTargetId(userId);
    setView("impersonation");
    setSelectedId(null);
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
          <button
            onClick={signOutLocal}
            className="dg-btn dg-btn-ghost"
            style={{ fontSize: "var(--dg-fs-label)" }}
          >
            Sign out
          </button>
        )}
      </header>

      {/* Mobile section chips */}
      {isMobile && (
        <div className="dg-mobile-section-bar">
          {([
            { key: "dashboard", label: "Dashboard" },
            { key: "all-users", label: "Users" },
            { key: "audit-log", label: "Audit" },
            { key: "create-organization", label: "New Org" },
            { key: "impersonation", label: "Impersonate" },
          ] as { key: GridmasterView; label: string }[]).map((item) => (
            <button
              key={item.key}
              className={`dg-mobile-section-chip${view === item.key ? " active" : ""}`}
              onClick={() => { setView(item.key); setSelectedId(null); if (item.key === "impersonation") setImpersonateTargetId(undefined); }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Body: sidebar + content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
        {/* Expand button (shown when sidebar is collapsed) */}
        {sidebarCollapsed && !isMobile && (
          <button className="dg-sidebar-expand" onClick={toggleSidebar} title="Expand sidebar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}

        {/* Sidebar (desktop only) */}
        {!isMobile && (
          <aside
            className={`dg-sidebar${sidebarCollapsed ? " collapsed" : ""}`}
            style={{
              width: 220,
              flexShrink: 0,
              background: "var(--color-surface)",
              borderRight: "1px solid var(--color-border)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Collapse toggle */}
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 8px 0" }}>
              <button className="dg-sidebar-toggle" onClick={toggleSidebar} title="Collapse sidebar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            </div>

            {/* Navigation */}
            <div style={{ padding: "4px 8px 4px" }}>
              <div
                style={{
                  padding: "8px 12px 4px",
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 700,
                  color: "var(--color-text-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Navigation
              </div>
              <SidebarLink
                label="Dashboard"
                icon={DashboardIcon}
                active={view === "dashboard"}
                onClick={() => { setView("dashboard"); setSelectedId(null); }}
              />
              <SidebarLink
                label="All Users"
                icon={UsersIcon}
                active={view === "all-users"}
                onClick={() => { setView("all-users"); setSelectedId(null); }}
              />
              <SidebarLink
                label="Audit Log"
                icon={AuditIcon}
                active={view === "audit-log"}
                onClick={() => { setView("audit-log"); setSelectedId(null); }}
              />
            </div>

            {/* Actions */}
            <div style={{ padding: "4px 8px" }}>
              <div
                style={{
                  padding: "8px 12px 4px",
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 700,
                  color: "var(--color-text-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Actions
              </div>
              <SidebarLink
                label="New Organization"
                icon={PlusIcon}
                active={view === "create-organization"}
                onClick={() => { setView("create-organization"); setSelectedId(null); }}
              />
            </div>

            {/* Tools */}
            <div style={{ borderTop: "1px solid var(--color-border)", padding: "8px 8px 12px", marginTop: "auto" }}>
              <div
                style={{
                  padding: "8px 12px 4px",
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 700,
                  color: "var(--color-text-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Tools
              </div>
              <SidebarLink
                label="Impersonation"
                icon={ImpersonateIcon}
                active={view === "impersonation"}
                onClick={() => { setView("impersonation"); setSelectedId(null); setImpersonateTargetId(undefined); }}
              />
            </div>
          </aside>
        )}

        {/* Main content */}
        <main style={{ flex: 1, overflow: "auto", padding: isMobile ? 16 : 24 }}>
          {error && (
            <div
              style={{
                padding: "12px 16px",
                background: "var(--color-danger-bg)",
                color: "var(--color-danger)",
                borderRadius: 10,
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
            <CreateOrganizationForm
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
              initialTargetId={impersonateTargetId}
            />
          )}
        </main>
      </div>
    </div>
  );
}
