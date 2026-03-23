"use client";

import { useState, useEffect } from "react";
import type { Organization, AuditLogEntry } from "@/types";
import type { TenantStats } from "@/lib/db";
import { fetchAuditLog } from "@/lib/db";
import { sectionStyle, thStyle } from "@/lib/styles";

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        ...sectionStyle,
        padding: "20px 24px",
        flex: 1,
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: "var(--dg-fs-page-title)", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
    </div>
  );
}

// ── Recent activity row ──────────────────────────────────────────────────────

function ActivityRow({ entry }: { entry: AuditLogEntry }) {
  const date = new Date(entry.createdAt);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid var(--color-border-light)",
        fontSize: "var(--dg-fs-label)",
      }}
    >
      <div style={{ flex: 1, color: "var(--color-text-secondary)" }}>
        <span style={{ fontWeight: 600 }}>{entry.changedByEmail ?? "Unknown"}</span>
        {" changed "}
        <span style={{ fontWeight: 600 }}>{entry.targetEmail ?? "Unknown"}</span>
        {" from "}
        <span style={{ fontWeight: 600, color: "var(--color-text-muted)" }}>
          {entry.fromRole.replace("_", " ")}
        </span>
        {" → "}
        <span style={{ fontWeight: 600 }}>
          {entry.toRole.replace("_", " ")}
        </span>
      </div>
      {entry.orgName && (
        <span style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-subtle)", flexShrink: 0 }}>
          {entry.orgName}
        </span>
      )}
      <span style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-subtle)", flexShrink: 0, whiteSpace: "nowrap" }}>
        {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        {" "}
        {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
      </span>
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────

export default function GridmasterDashboard({
  organizations,
  stats,
  totalUsers,
  totalEmployees,
  onSelectOrg,
  onCreateOrg,
}: {
  organizations: Organization[];
  stats: Map<string, TenantStats>;
  totalUsers: number;
  totalEmployees: number;
  onSelectOrg: (id: string) => void;
  onCreateOrg: () => void;
}) {
  const [recentActivity, setRecentActivity] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchAuditLog({ limit: 10 })
      .then((entries) => { if (!cancelled) setRecentActivity(entries); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const activeOrganizations = organizations.filter((c) => !c.archivedAt);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)" }}>
          Dashboard
        </h2>
        <button className="dg-btn dg-btn-primary" onClick={onCreateOrg}>
          + New Organization
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <StatCard label="Organizations" value={activeOrganizations.length} />
        <StatCard label="Users" value={totalUsers} />
        <StatCard label="Employees" value={totalEmployees} />
      </div>

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: "var(--dg-fs-body-sm)", fontWeight: 700, color: "var(--color-text-secondary)" }}>
            Recent Activity
          </h3>
          <div
            style={{
              ...sectionStyle,
              padding: "4px 20px",
            }}
          >
            {recentActivity.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* Organization list */}
      <h3 style={{ margin: "0 0 12px", fontSize: "var(--dg-fs-body-sm)", fontWeight: 700, color: "var(--color-text-secondary)" }}>
        All Organizations
      </h3>
      <div
        style={sectionStyle}
      >
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", whiteSpace: "nowrap" }}>
          <thead>
            <tr>
              {["Name", "Slug", "Users", "Employees", "Focus Areas", "Certifications", "Roles", "Timezone"].map((h) => (
                <th
                  key={h}
                  style={{
                    ...thStyle,
                    borderBottom: "1px solid var(--color-border-light)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeOrganizations.map((c) => {
              const s = stats.get(c.id);
              return (
                <tr
                  key={c.id}
                  onClick={() => onSelectOrg(c.id)}
                  style={{ cursor: "pointer", transition: "background 150ms ease" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-bg-secondary)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <td style={{ padding: "10px 14px", fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-primary)", borderBottom: "1px solid var(--color-border-light)" }}>
                    {c.name}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", fontFamily: "var(--font-dm-mono), monospace", borderBottom: "1px solid var(--color-border-light)" }}>
                    {c.slug ?? "—"}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border-light)" }}>
                    {s?.userCount ?? 0}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border-light)" }}>
                    {s?.employeeCount ?? 0}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: "var(--dg-fs-caption)", borderBottom: "1px solid var(--color-border-light)" }}>
                    {c.focusAreaLabel && c.focusAreaLabel !== "Focus Areas" ? (
                      <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{c.focusAreaLabel}</span>
                    ) : (
                      <span style={{ color: "var(--color-text-subtle)" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: "var(--dg-fs-caption)", borderBottom: "1px solid var(--color-border-light)" }}>
                    {c.certificationLabel && c.certificationLabel !== "Certifications" ? (
                      <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{c.certificationLabel}</span>
                    ) : (
                      <span style={{ color: "var(--color-text-subtle)" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: "var(--dg-fs-caption)", borderBottom: "1px solid var(--color-border-light)" }}>
                    {c.roleLabel && c.roleLabel !== "Roles" ? (
                      <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{c.roleLabel}</span>
                    ) : (
                      <span style={{ color: "var(--color-text-subtle)" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: "var(--dg-fs-caption)", color: "var(--color-text-subtle)", borderBottom: "1px solid var(--color-border-light)" }}>
                    {c.timezone ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}
