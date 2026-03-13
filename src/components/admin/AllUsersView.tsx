"use client";

import { useState, useEffect, useMemo } from "react";
import { fetchAllUsers } from "@/lib/db";
import type { PlatformUser, Company } from "@/types";

const sectionStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  overflow: "hidden",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--color-text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 13,
  color: "var(--color-text-primary)",
  borderTop: "1px solid var(--color-border-light)",
};

const roleBadgeColors: Record<string, { bg: string; text: string }> = {
  super_admin: { bg: "#FEF3C7", text: "#92400E" },
  admin: { bg: "#DBEAFE", text: "#1E40AF" },
  user: { bg: "var(--color-surface-overlay)", text: "var(--color-text-muted)" },
  gridmaster: { bg: "#F3E8FF", text: "#6B21A8" },
};

function RoleBadge({ role }: { role: string }) {
  const c = roleBadgeColors[role] ?? roleBadgeColors.user;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        background: c.bg,
        color: c.text,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      {role.replace("_", " ")}
    </span>
  );
}

export default function AllUsersView({
  companies,
  onNavigateToCompany,
  onImpersonate,
}: {
  companies: Company[];
  onNavigateToCompany: (companyId: string) => void;
  onImpersonate: (userId: string) => void;
}) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAllUsers()
      .then((data) => { if (!cancelled) setUsers(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      if (q && !(u.email ?? "").toLowerCase().includes(q)) return false;
      if (roleFilter !== "all") {
        if (roleFilter === "gridmaster" && u.platformRole !== "gridmaster") return false;
        if (roleFilter !== "gridmaster" && u.companyRole !== roleFilter) return false;
      }
      if (companyFilter !== "all" && u.companyId !== companyFilter) return false;
      return true;
    });
  }, [users, search, roleFilter, companyFilter]);

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>
        Loading users…
      </div>
    );
  }

  return (
    <>
      <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" }}>
        All Users ({users.length})
      </h2>

      {error && (
        <div style={{ padding: "12px 16px", background: "var(--color-danger-bg)", color: "var(--color-danger)", borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="dg-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email…"
          style={{ maxWidth: 280 }}
        />
        <select
          className="dg-input"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{ maxWidth: 160, cursor: "pointer" }}
        >
          <option value="all">All Roles</option>
          <option value="gridmaster">Gridmaster</option>
          <option value="super_admin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </select>
        <select
          className="dg-input"
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          style={{ maxWidth: 200, cursor: "pointer" }}
        >
          <option value="all">All Companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div style={sectionStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Platform Role</th>
                <th style={thStyle}>Company Role</th>
                <th style={thStyle}>Company</th>
                <th style={thStyle}>Joined</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--color-text-muted)", padding: 32 }}>
                    No users found
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id}>
                    <td style={{ ...tdStyle, fontWeight: 600, fontSize: 12 }}>
                      {u.email ?? "—"}
                    </td>
                    <td style={tdStyle}>
                      {u.platformRole !== "none" && <RoleBadge role={u.platformRole} />}
                    </td>
                    <td style={tdStyle}>
                      {u.companyRole && <RoleBadge role={u.companyRole} />}
                    </td>
                    <td style={tdStyle}>
                      {u.companyName ? (
                        <button
                          onClick={() => u.companyId && onNavigateToCompany(u.companyId)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--color-info)",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 500,
                            fontFamily: "inherit",
                            padding: 0,
                            textDecoration: "underline",
                          }}
                        >
                          {u.companyName}
                        </button>
                      ) : (
                        <span style={{ color: "var(--color-text-muted)" }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                      {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td style={tdStyle}>
                      {u.platformRole !== "gridmaster" && (
                        <button
                          className="dg-btn dg-btn-ghost"
                          style={{ fontSize: 12, padding: "3px 8px" }}
                          onClick={() => onImpersonate(u.id)}
                        >
                          Impersonate
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
