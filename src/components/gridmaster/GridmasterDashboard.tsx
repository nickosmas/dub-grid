"use client";

import { useState, useEffect } from "react";
import type { Organization, AuditLogEntry, FullAuditLogEntry } from "@/types";
import type { TenantStats } from "@/lib/db";
import { fetchAuditLog, fetchFullAuditLog } from "@/lib/db";
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
      <div style={{ fontSize: "var(--dg-fs-page-title)", fontWeight: 700, fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", color: "var(--color-text-primary)", marginBottom: 4 }}>
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
  const [platformActivity, setPlatformActivity] = useState<FullAuditLogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchAuditLog({ limit: 10 })
      .then((entries) => { if (!cancelled) setRecentActivity(entries); })
      .catch(() => {});
    fetchFullAuditLog({ limit: 100 })
      .then((entries) => { if (!cancelled) setPlatformActivity(entries); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const activeOrganizations = organizations.filter((c) => !c.archivedAt);
  const suspendedOrgs = organizations.filter((c) => c.suspendedAt);
  const archivedOrgs = organizations.filter((c) => c.archivedAt);

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
        <StatCard label="Active Orgs" value={activeOrganizations.length - suspendedOrgs.filter((o) => !o.archivedAt).length} />
        <StatCard label="Suspended" value={suspendedOrgs.length} />
        <StatCard label="Archived" value={archivedOrgs.length} />
        <StatCard label="Users" value={totalUsers} />
        <StatCard label="Employees" value={totalEmployees} />
      </div>

      {/* Suspended orgs alert */}
      {suspendedOrgs.length > 0 && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--color-warning-bg, #fff8e6)",
            border: "1px solid var(--color-warning, #b08800)",
            borderRadius: 10,
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            color: "var(--color-warning, #b08800)",
            marginBottom: 20,
          }}
        >
          {suspendedOrgs.length} organization{suspendedOrgs.length !== 1 ? "s" : ""} currently suspended:{" "}
          {suspendedOrgs.map((o, i) => (
            <span key={o.id}>
              {i > 0 && ", "}
              <button
                onClick={() => onSelectOrg(o.id)}
                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", padding: 0, textDecoration: "underline" }}
              >
                {o.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Platform Activity Trends */}
      {platformActivity.length > 0 && (() => {
        const now = Date.now();
        const day = 86400000;
        const last24h = platformActivity.filter((e) => now - new Date(e.createdAt).getTime() < day);
        const last7d = platformActivity.filter((e) => now - new Date(e.createdAt).getTime() < 7 * day);

        // Group by action category
        const categories: Record<string, number> = {};
        for (const e of last7d) {
          const cat = e.action.split(".")[0] ?? "other";
          categories[cat] = (categories[cat] ?? 0) + 1;
        }
        const topCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 6);

        // Anomaly: any single org with >30% of all actions
        const orgCounts: Record<string, number> = {};
        for (const e of last7d) {
          if (e.orgId) orgCounts[e.orgId] = (orgCounts[e.orgId] ?? 0) + 1;
        }
        const anomalies = Object.entries(orgCounts)
          .filter(([, count]) => count > last7d.length * 0.3 && count > 10)
          .map(([oid, count]) => ({ orgId: oid, count, name: organizations.find((o) => o.id === oid)?.name ?? oid.slice(0, 8) }));

        return (
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: "var(--dg-fs-body-sm)", fontWeight: 700, color: "var(--color-text-secondary)" }}>
              Platform Activity (last 7 days)
            </h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ ...sectionStyle, padding: "12px 16px", flex: "1 1 120px", minWidth: 120 }}>
                <div style={{ fontSize: "var(--dg-fs-card-title)", fontWeight: 700, color: "var(--color-text-primary)" }}>{last24h.length}</div>
                <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>Last 24h</div>
              </div>
              <div style={{ ...sectionStyle, padding: "12px 16px", flex: "1 1 120px", minWidth: 120 }}>
                <div style={{ fontSize: "var(--dg-fs-card-title)", fontWeight: 700, color: "var(--color-text-primary)" }}>{last7d.length}</div>
                <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>Last 7 days</div>
              </div>
              {topCategories.map(([cat, count]) => (
                <div key={cat} style={{ ...sectionStyle, padding: "12px 16px", flex: "1 1 120px", minWidth: 120 }}>
                  <div style={{ fontSize: "var(--dg-fs-card-title)", fontWeight: 700, color: "var(--color-text-primary)" }}>{count}</div>
                  <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", textTransform: "capitalize" }}>{cat}</div>
                </div>
              ))}
            </div>
            {anomalies.length > 0 && (
              <div style={{
                padding: "10px 14px", background: "var(--color-danger-bg)", border: "1px solid var(--color-danger)",
                borderRadius: 8, fontSize: "var(--dg-fs-label)", color: "var(--color-danger)", fontWeight: 600,
              }}>
                Anomaly detected: {anomalies.map((a) => `${a.name} (${a.count} actions)`).join(", ")}
              </div>
            )}
          </div>
        );
      })()}

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
              {["Name", "Slug", "Status", "Users", "Employees", "Focus Areas", "Certifications", "Roles", "Timezone"].map((h) => (
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
            {organizations.filter((c) => !c.archivedAt).map((c) => {
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
                  <td style={{ padding: "10px 14px", fontSize: "var(--dg-fs-footnote)", borderBottom: "1px solid var(--color-border-light)" }}>
                    {c.suspendedAt ? (
                      <span style={{ fontWeight: 600, color: "var(--color-danger)", background: "var(--color-danger-bg)", padding: "1px 6px", borderRadius: 4, textTransform: "uppercase" }}>Suspended</span>
                    ) : (
                      <span style={{ fontWeight: 600, color: "var(--color-success, #1a8a1a)", background: "var(--color-success-bg, #e6f9e6)", padding: "1px 6px", borderRadius: 4, textTransform: "uppercase" }}>Active</span>
                    )}
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
