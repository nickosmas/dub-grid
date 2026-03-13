"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePermissions, useLogout } from "@/hooks";
import { DubGridLogo } from "@/components/Logo";
import AdminDashboard from "@/components/admin/AdminDashboard";
import CompanyDetail from "@/components/admin/CompanyDetail";
import CreateCompanyForm from "@/components/admin/CreateCompanyForm";
import AllUsersView from "@/components/admin/AllUsersView";
import AuditLogView from "@/components/admin/AuditLogView";
import EnhancedImpersonation from "@/components/admin/EnhancedImpersonation";
import {
  fetchAllCompanies,
  fetchTenantStats,
  type TenantStats,
} from "@/lib/db";
import type { Company } from "@/types";

type AdminView =
  | "dashboard"
  | "all-users"
  | "audit-log"
  | "company"
  | "impersonation"
  | "create-company";

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
          ? "var(--color-surface-overlay)"
          : hovered
            ? "var(--color-border-light)"
            : "transparent",
        border: "none",
        borderRadius: 7,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active
          ? "var(--color-text-primary)"
          : hovered
            ? "var(--color-text-primary)"
            : "var(--color-text-muted)",
        opacity: dimmed ? 0.5 : 1,
        textAlign: "left",
        fontFamily: "inherit",
        transition: "background 120ms ease, color 120ms ease",
        position: "relative",
      }}
    >
      {active && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: "20%",
            height: "60%",
            width: 3,
            borderRadius: 2,
            background: "var(--color-accent-gradient)",
          }}
        />
      )}
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
            fontSize: 11,
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

// ── Company search combobox (header) ─────────────────────────────────────────

function CompanySearchCombobox({
  companies,
  stats,
  selectedCompany,
  onSelect,
}: {
  companies: Company[];
  stats: Map<string, TenantStats>;
  selectedCompany: Company | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return companies.filter((c) =>
      !q || c.name.toLowerCase().includes(q) || (c.slug ?? "").toLowerCase().includes(q)
    );
  }, [companies, query]);

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
        {selectedCompany && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              background: "var(--color-surface-overlay)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              padding: "3px 10px",
              color: "var(--color-text-primary)",
              whiteSpace: "nowrap",
              maxWidth: 160,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {selectedCompany.name}
          </span>
        )}
        <input
          type="text"
          placeholder="Search companies…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); } }}
          className="dg-input"
          style={{ width: 240, fontSize: 13 }}
        />
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: 380,
            background: "#fff",
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
            fontSize: 11,
            fontWeight: 700,
            color: "var(--color-text-subtle)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            borderBottom: "1px solid var(--color-border-light)",
          }}>
            {query ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""}` : `All Companies (${companies.length})`}
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "20px 14px", fontSize: 13, color: "var(--color-text-muted)", textAlign: "center" }}>
                No matching companies
              </div>
            ) : (
              filtered.map((c) => {
                const empCount = stats.get(c.id)?.employeeCount ?? 0;
                const isArchived = !!c.archivedAt;
                const isActive = selectedCompany?.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => { onSelect(c.id); setOpen(false); setQuery(""); }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                      padding: "8px 14px",
                      background: isActive ? "var(--color-surface-overlay)" : "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--color-border-light)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                      opacity: isArchived ? 0.5 : 1,
                      transition: "background 80ms ease",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-surface-overlay)"; }}
                    onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </div>
                      {c.slug && (
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "var(--font-dm-mono), monospace", marginTop: 1 }}>
                          {c.slug}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 10 }}>
                      {isArchived && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-subtle)", background: "var(--color-surface-overlay)", padding: "1px 6px", borderRadius: 4, textTransform: "uppercase" }}>
                          Archived
                        </span>
                      )}
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-subtle)", background: "var(--color-surface-overlay)", padding: "1px 8px", borderRadius: 4 }}>
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

export default function AdminPage() {
  const { isGridmaster, isLoading: permLoading } = usePermissions();
  const { signOutLocal } = useLogout();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<Map<string, TenantStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<AdminView>("dashboard");
  const [impersonateTargetId, setImpersonateTargetId] = useState<string | undefined>();

  const loadData = useCallback(async () => {
    try {
      const [companiesData, statsData] = await Promise.all([
        fetchAllCompanies(),
        fetchTenantStats(),
      ]);
      setCompanies(companiesData);
      const map = new Map<string, TenantStats>();
      for (const s of statsData) map.set(s.companyId, s);
      setStats(map);
    } catch (err: any) {
      setError(err.message ?? "Failed to load data");
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
        <span style={{ color: "var(--color-text-muted)", fontSize: 14 }}>Loading…</span>
      </div>
    );
  }

  if (!isGridmaster) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 520 }}>
          <h1 style={{ marginBottom: 8, fontSize: 24, color: "var(--color-danger)" }}>Access denied</h1>
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

  const selectedCompany = selectedId ? companies.find((c) => c.id === selectedId) ?? null : null;

  function selectCompany(id: string) {
    setSelectedId(id);
    setView("company");
  }

  function handleImpersonate(userId: string) {
    setImpersonateTargetId(userId);
    setView("impersonation");
    setSelectedId(null);
  }

  function handleCompanyCreated(company: Company) {
    setCompanies((prev) => [...prev, company].sort((a, b) => a.name.localeCompare(b.name)));
    selectCompany(company.id);
  }

  function handleCompanyUpdated(updated: Company) {
    setCompanies((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header
        style={{
          height: 56,
          background: "#fff",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <DubGridLogo size={28} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>
            Gridmaster
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#fff",
              background: "var(--color-text-primary)",
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            Command Center
          </span>
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <CompanySearchCombobox
            companies={companies}
            stats={stats}
            selectedCompany={selectedCompany}
            onSelect={selectCompany}
          />
        </div>
        <button
          onClick={signOutLocal}
          className="dg-btn dg-btn-ghost"
          style={{ fontSize: 13 }}
        >
          Sign out
        </button>
      </header>

      {/* Body: sidebar + content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <aside
          style={{
            width: 220,
            flexShrink: 0,
            background: "#fff",
            borderRight: "1px solid var(--color-border)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Navigation */}
          <div style={{ padding: "12px 8px 4px" }}>
            <div
              style={{
                padding: "8px 12px 4px",
                fontSize: 11,
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
                fontSize: 11,
                fontWeight: 700,
                color: "var(--color-text-subtle)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Actions
            </div>
            <SidebarLink
              label="New Company"
              icon={PlusIcon}
              active={view === "create-company"}
              onClick={() => { setView("create-company"); setSelectedId(null); }}
            />
          </div>

          {/* Tools */}
          <div style={{ borderTop: "1px solid var(--color-border)", padding: "8px 8px 12px", marginTop: "auto" }}>
            <div
              style={{
                padding: "8px 12px 4px",
                fontSize: 11,
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

        {/* Main content */}
        <main style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {error && (
            <div
              style={{
                padding: "12px 16px",
                background: "var(--color-danger-bg)",
                color: "var(--color-danger)",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 20,
              }}
            >
              {error}
            </div>
          )}

          {view === "dashboard" && (
            <AdminDashboard
              companies={companies}
              stats={stats}
              totalUsers={totalUsers}
              totalEmployees={totalEmployees}
              onSelectCompany={selectCompany}
              onCreateCompany={() => { setView("create-company"); setSelectedId(null); }}
            />
          )}

          {view === "all-users" && (
            <AllUsersView
              companies={companies}
              onNavigateToCompany={selectCompany}
              onImpersonate={handleImpersonate}
            />
          )}

          {view === "audit-log" && (
            <AuditLogView />
          )}

          {view === "create-company" && (
            <CreateCompanyForm
              onCreated={handleCompanyCreated}
              onCancel={() => setView("dashboard")}
            />
          )}

          {view === "company" && selectedCompany && (
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
                  fontSize: 13,
                  color: "var(--color-text-muted)",
                  padding: "0 0 12px",
                  transition: "color 100ms ease",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-text-primary)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                All Companies
              </button>
              <CompanyDetail
                company={selectedCompany}
                stats={stats.get(selectedCompany.id)}
                onCompanyUpdated={handleCompanyUpdated}
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
