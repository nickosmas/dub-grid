"use client";

import { useState, useEffect, useMemo } from "react";
import { fetchAllUsers } from "@/lib/db";
import type { PlatformUser, Organization } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import { BOX_SHADOW_CARD } from "@/lib/constants";

const sectionStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  overflow: "hidden",
  boxShadow: BOX_SHADOW_CARD,
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
  organizations,
  onNavigateToOrg,
  onImpersonate,
}: {
  organizations: Organization[];
  onNavigateToOrg: (orgId: string) => void;
  onImpersonate: (userId: string) => void;
}) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [orgFilter, setOrgFilter] = useState<string>("all");

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
        if (roleFilter !== "gridmaster" && u.orgRole !== roleFilter) return false;
      }
      if (orgFilter !== "all" && u.orgId !== orgFilter) return false;
      return true;
    });
  }, [users, search, roleFilter, orgFilter]);

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>
        Loading users…
      </div>
    );
  }

  return (
    <>
      {error && (
        <div style={{ padding: "12px 16px", background: "var(--color-danger-bg)", color: "var(--color-danger)", borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        {/* Left group: filter dropdowns */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-subtle)", textTransform: "uppercase", whiteSpace: "nowrap" }}>Filter</span>
          <CustomSelect
            value={roleFilter}
            options={[
              { value: "all", label: "All Roles" },
              { value: "gridmaster", label: "Gridmaster" },
              { value: "super_admin", label: "Super Admin" },
              { value: "admin", label: "Admin" },
              { value: "user", label: "User" },
            ]}
            onChange={setRoleFilter}
            style={{ width: "auto", minWidth: 140 }}
            fontSize={12}
          />
          <CustomSelect
            value={orgFilter}
            options={[
              { value: "all", label: "All Organizations" },
              ...organizations.map((c) => ({ value: c.id, label: c.name })),
            ]}
            onChange={setOrgFilter}
            style={{ width: "auto", minWidth: 160 }}
            fontSize={12}
          />
          {(search || roleFilter !== "all" || orgFilter !== "all") && (
            <button
              onClick={() => { setSearch(""); setRoleFilter("all"); setOrgFilter("all"); }}
              style={{
                background: "none", border: "none", color: "var(--color-today-text)", fontSize: 12,
                fontWeight: 600, cursor: "pointer", padding: "4px 8px",
              }}
            >
              Clear
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Right group: count, search */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
            {filtered.length} of {users.length}
          </span>
          <div style={{ position: "relative", minWidth: 180, maxWidth: 240 }}>
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-faint)" }}
            >
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="dg-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              style={{ paddingLeft: 32, fontSize: 12, background: "var(--color-surface)", border: "1px solid var(--color-border-light)" }}
            />
          </div>
        </div>
      </div>

      {/* Table & Empty State */}
      {filtered.length > 0 ? (
        <div style={sectionStyle}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Platform Role</th>
                  <th style={thStyle}>Organization Role</th>
                  <th style={thStyle}>Organization</th>
                  <th style={thStyle}>Joined</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td style={{ ...tdStyle, fontWeight: 600, fontSize: 12 }}>
                      {u.email ?? "—"}
                    </td>
                    <td style={tdStyle}>
                      {u.platformRole !== "none" && <RoleBadge role={u.platformRole} />}
                    </td>
                    <td style={tdStyle}>
                      {u.orgRole && <RoleBadge role={u.orgRole} />}
                    </td>
                    <td style={tdStyle}>
                      {u.orgName ? (
                        <button
                          onClick={() => u.orgId && onNavigateToOrg(u.orgId)}
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
                          {u.orgName}
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: "48px 20px",
            textAlign: "center",
            background: "#fff",
            borderRadius: 12,
            border: "1px dashed var(--color-border)",
            color: "var(--color-text-muted)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ color: "var(--color-text-faint)", background: "#F8FAFC", padding: "12px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div>
            <div style={{ fontSize: "var(--dg-fs-title)", fontWeight: 600, marginBottom: 4 }}>
              No users found
            </div>
            <div style={{ fontSize: 13 }}>
              There are no matching users for these filters.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
