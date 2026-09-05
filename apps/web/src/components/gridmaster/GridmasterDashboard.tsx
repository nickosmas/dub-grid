"use client";

import type { Organization, AuditLogEntry } from "@/types";
import { Button } from "@/components/Button";
import {
  fetchGridmasterAuditLog,
  fetchGridmasterOverview,
  type TenantStats,
} from "@/features/gridmaster/client";
import { useQuery } from "@tanstack/react-query";
import {
  formatBillingStatusLabel,
  formatClientLabel,
  formatOrganizationRoleLabel,
} from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
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
      <div
        style={{
          fontSize: "var(--dg-type-page-title-size)",
          fontWeight: 700,
          fontFamily: "var(--font-dm-mono), 'DM Mono', monospace",
          color: "var(--dg-color-text-primary)",
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "var(--dg-type-field-title-size)",
          fontWeight: "var(--dg-type-field-title-weight)",
          color: "var(--dg-type-field-title-color)",
          letterSpacing: "var(--dg-type-field-title-letter-spacing)",
          lineHeight: "var(--dg-type-field-title-line-height)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function OversightCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  detail: string;
  tone?: "neutral" | "good" | "warning" | "danger";
}) {
  const color =
    tone === "danger"
      ? "var(--dg-color-danger)"
      : tone === "warning"
        ? "var(--dg-color-warning)"
        : tone === "good"
          ? "var(--dg-color-success)"
          : "var(--dg-color-text-primary)";
  return (
    <div style={{ ...sectionStyle, padding: "14px 16px", minWidth: 160, flex: "1 1 170px" }}>
      <div
        style={{
          fontSize: "var(--dg-fs-card-title)",
          fontWeight: 700,
          color,
          fontFamily: "var(--font-dm-mono), monospace",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "var(--dg-fs-caption)",
          fontWeight: 700,
          color: "var(--dg-color-text-primary)",
          marginTop: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "var(--dg-fs-footnote)",
          color: "var(--dg-color-text-muted)",
          marginTop: 2,
        }}
      >
        {detail}
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
        borderBottom: "1px solid var(--dg-color-border-light)",
        fontSize: "var(--dg-fs-label)",
      }}
    >
      <div style={{ flex: 1, color: "var(--dg-color-text-secondary)" }}>
        <span style={{ fontWeight: 600 }}>{entry.changedByEmail ?? "Unknown"}</span>
        {" changed "}
        <span style={{ fontWeight: 600 }}>{entry.targetEmail ?? "Unknown"}</span>
        {" from "}
        <span style={{ fontWeight: 600, color: "var(--dg-color-text-muted)" }}>
          {formatOrganizationRoleLabel(entry.fromRole)}
        </span>
        {" → "}
        <span style={{ fontWeight: 600 }}>{formatOrganizationRoleLabel(entry.toRole)}</span>
      </div>
      {entry.orgName && (
        <span
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--dg-color-text-subtle)",
            flexShrink: 0,
          }}
        >
          {entry.orgName}
        </span>
      )}
      <span
        style={{
          fontSize: "var(--dg-fs-footnote)",
          color: "var(--dg-color-text-subtle)",
          flexShrink: 0,
          whiteSpace: "nowrap",
          fontFamily: "var(--font-dm-mono), monospace",
        }}
      >
        {date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{" "}
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
  const overviewQuery = useQuery({
    queryKey: queryKeys.gridmaster.overview(),
    queryFn: fetchGridmasterOverview,
    staleTime: 30_000,
  });
  const recentActivityQuery = useQuery({
    queryKey: queryKeys.gridmaster.orgAudit(null, 0, 10, "dashboard-recent"),
    queryFn: () => fetchGridmasterAuditLog({ limit: 10 }),
    staleTime: 30_000,
  });
  const overview = overviewQuery.data ?? null;
  const recentActivity = recentActivityQuery.data ?? [];

  const activeOrganizations = organizations.filter((c) => !c.archivedAt);
  const suspendedOrgs = organizations.filter((c) => c.suspendedAt);
  const archivedOrgs = organizations.filter((c) => c.archivedAt);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "var(--dg-type-page-title-size)",
            fontWeight: 700,
            color: "var(--dg-color-text-primary)",
          }}
        >
          Dashboard
        </h2>
        <Button className="dg-btn dg-btn-primary" onClick={onCreateOrg}>
          + New Organization
        </Button>
      </div>

      {overview && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 28 }}>
          <div>
            <h3
              style={{
                margin: "0 0 10px",
                fontSize: "var(--dg-fs-body-sm)",
                fontWeight: 700,
                color: "var(--dg-color-text-secondary)",
              }}
            >
              Platform Oversight
            </h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <OversightCard
                label="DB / Redis"
                value={overview.platformHealth.redis.productionReady ? "OK" : "Check"}
                detail={
                  overview.platformHealth.redis.configured
                    ? "Rate limiting configured"
                    : (overview.platformHealth.redis.message ?? "Redis not configured")
                }
                tone={overview.platformHealth.redis.productionReady ? "good" : "warning"}
              />
              <OversightCard
                label="Active Sessions"
                value={overview.platformHealth.activeSessionCount}
                detail={`${overview.platformHealth.staleSessionCount} stale over 30d`}
                tone={overview.platformHealth.staleSessionCount > 0 ? "warning" : "good"}
              />
              <OversightCard
                label="Mobile Devices"
                value={overview.platformHealth.activeMobileTokenCount}
                detail="Active push tokens"
              />
              <OversightCard
                label="Org Risk"
                value={overview.orgRisk.riskiestOrganizations.length}
                detail={`${overview.orgRisk.pendingSetupCount} setup, ${overview.orgRisk.noLoginCount} stale login`}
                tone={overview.orgRisk.riskiestOrganizations.length > 0 ? "warning" : "good"}
              />
              <OversightCard
                label="Billing Risk"
                value={overview.businessHealth.billingRiskCount}
                detail={`${overview.businessHealth.trialEndingCount} trials ending, ${overview.businessHealth.trialsNotStartedCount} not started, ${overview.businessHealth.seatMismatchCount} seat gaps`}
                tone={
                  overview.businessHealth.billingRiskCount > 0 ||
                  overview.businessHealth.seatMismatchCount > 0
                    ? "danger"
                    : "good"
                }
              />
              <OversightCard
                label="Compliance Alerts"
                value={overview.complianceAlerts.highRiskAuditCount}
                detail={`${overview.complianceAlerts.activeImpersonationCount} active impersonations`}
                tone={overview.complianceAlerts.highRiskAuditCount > 0 ? "warning" : "good"}
              />
            </div>
          </div>

          {overview.orgRisk.riskiestOrganizations.length > 0 && (
            <div>
              <h3
                style={{
                  margin: "0 0 10px",
                  fontSize: "var(--dg-fs-body-sm)",
                  fontWeight: 700,
                  color: "var(--dg-color-text-secondary)",
                }}
              >
                Highest Risk Organizations
              </h3>
              <div style={sectionStyle}>
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{ width: "100%", borderCollapse: "collapse", whiteSpace: "nowrap" }}
                  >
                    <thead>
                      <tr>
                        {["Org", "Score", "Risk", "Active users", "Open requests", "Billing"].map(
                          (h) => (
                            <th
                              key={h}
                              style={{
                                ...thStyle,
                                borderBottom: "1px solid var(--dg-color-border-light)",
                              }}
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {overview.orgRisk.riskiestOrganizations.map((org) => (
                        <tr
                          key={org.orgId}
                          style={{ cursor: "pointer" }}
                          onClick={() => onSelectOrg(org.orgId)}
                        >
                          <td
                            style={{
                              padding: "10px 14px",
                              fontSize: "var(--dg-fs-label)",
                              fontWeight: 700,
                              borderBottom: "1px solid var(--dg-color-border-light)",
                            }}
                          >
                            {org.orgName}
                          </td>
                          <td
                            style={{
                              padding: "10px 14px",
                              fontSize: "var(--dg-fs-label)",
                              fontWeight: 700,
                              color:
                                org.oversightScore < 60
                                  ? "var(--dg-color-danger)"
                                  : "var(--dg-color-warning)",
                              borderBottom: "1px solid var(--dg-color-border-light)",
                            }}
                          >
                            {org.oversightScore}
                          </td>
                          <td
                            style={{
                              padding: "10px 14px",
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--dg-color-text-muted)",
                              borderBottom: "1px solid var(--dg-color-border-light)",
                            }}
                          >
                            {org.riskFlags.length
                              ? org.riskFlags.map(formatClientLabel).join(", ")
                              : "None"}
                          </td>
                          <td
                            style={{
                              padding: "10px 14px",
                              fontSize: "var(--dg-fs-label)",
                              borderBottom: "1px solid var(--dg-color-border-light)",
                            }}
                          >
                            {org.supportSnapshot.activeUsers30d}
                          </td>
                          <td
                            style={{
                              padding: "10px 14px",
                              fontSize: "var(--dg-fs-label)",
                              borderBottom: "1px solid var(--dg-color-border-light)",
                            }}
                          >
                            {org.supportSnapshot.openShiftRequests}
                          </td>
                          <td
                            style={{
                              padding: "10px 14px",
                              fontSize: "var(--dg-fs-caption)",
                              borderBottom: "1px solid var(--dg-color-border-light)",
                            }}
                          >
                            {formatBillingStatusLabel(org.billing.subscriptionStatus)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <StatCard
          label="Active Orgs"
          value={activeOrganizations.length - suspendedOrgs.filter((o) => !o.archivedAt).length}
        />
        <StatCard label="Suspended" value={suspendedOrgs.length} />
        <StatCard label="Archived" value={archivedOrgs.length} />
        <StatCard label="Platform Users" value={totalUsers} />
        <StatCard label="Employees" value={totalEmployees} />
      </div>

      {/* Suspended orgs alert */}
      {suspendedOrgs.length > 0 && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--dg-color-warning-bg)",
            border: "1px solid var(--dg-color-warning)",
            borderRadius: "var(--dg-radius-lg)",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            color: "var(--dg-color-warning)",
            marginBottom: 20,
          }}
        >
          {suspendedOrgs.length} organization{suspendedOrgs.length !== 1 ? "s" : ""} currently
          suspended:{" "}
          {suspendedOrgs.map((o, i) => (
            <span key={o.id}>
              {i > 0 && ", "}
              <Button
                onClick={() => onSelectOrg(o.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontFamily: "inherit",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                {o.name}
              </Button>
            </span>
          ))}
        </div>
      )}

      {/* Platform Activity Trends */}
      {overview && overview.activitySummary.last7dCount > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3
            style={{
              margin: "0 0 12px",
              fontSize: "var(--dg-fs-body-sm)",
              fontWeight: 700,
              color: "var(--dg-color-text-secondary)",
            }}
          >
            Platform Activity
          </h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div
              style={{ ...sectionStyle, padding: "12px 16px", flex: "1 1 120px", minWidth: 120 }}
            >
              <div
                style={{
                  fontSize: "var(--dg-fs-card-title)",
                  fontWeight: 700,
                  color: "var(--dg-color-text-primary)",
                }}
              >
                {overview.activitySummary.last24hCount}
              </div>
              <div
                style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--dg-color-text-muted)" }}
              >
                Last 24h
              </div>
            </div>
            <div
              style={{ ...sectionStyle, padding: "12px 16px", flex: "1 1 120px", minWidth: 120 }}
            >
              <div
                style={{
                  fontSize: "var(--dg-fs-card-title)",
                  fontWeight: 700,
                  color: "var(--dg-color-text-primary)",
                }}
              >
                {overview.activitySummary.last7dCount}
              </div>
              <div
                style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--dg-color-text-muted)" }}
              >
                Last 7 days
              </div>
            </div>
            {overview.activitySummary.topCategories.map((category) => (
              <div
                key={category.category}
                style={{ ...sectionStyle, padding: "12px 16px", flex: "1 1 120px", minWidth: 120 }}
              >
                <div
                  style={{
                    fontSize: "var(--dg-fs-card-title)",
                    fontWeight: 700,
                    color: "var(--dg-color-text-primary)",
                  }}
                >
                  {category.count}
                </div>
                <div
                  style={{
                    fontSize: "var(--dg-fs-footnote)",
                    color: "var(--dg-color-text-muted)",
                    textTransform: "capitalize",
                  }}
                >
                  {category.category}
                </div>
              </div>
            ))}
          </div>
          {overview.activitySummary.busiestOrganizations.length > 0 && (
            <div style={sectionStyle}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", whiteSpace: "nowrap" }}>
                  <thead>
                    <tr>
                      {["Org", "Activity", "Type", "Status"].map((h) => (
                        <th
                          key={h}
                          style={{
                            ...thStyle,
                            borderBottom: "1px solid var(--dg-color-border-light)",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {overview.activitySummary.busiestOrganizations.map((signal) => (
                      <tr
                        key={signal.orgId}
                        style={{ cursor: "pointer" }}
                        onClick={() => onSelectOrg(signal.orgId)}
                      >
                        <td
                          style={{
                            padding: "10px 14px",
                            fontSize: "var(--dg-fs-label)",
                            fontWeight: 700,
                            borderBottom: "1px solid var(--dg-color-border-light)",
                          }}
                        >
                          {signal.orgName}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            fontSize: "var(--dg-fs-label)",
                            borderBottom: "1px solid var(--dg-color-border-light)",
                          }}
                        >
                          {signal.actionCount} actions
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            fontSize: "var(--dg-fs-caption)",
                            color: "var(--dg-color-text-muted)",
                            textTransform: "capitalize",
                            borderBottom: "1px solid var(--dg-color-border-light)",
                          }}
                        >
                          {signal.dominantCategory ?? "Activity"}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            fontSize: "var(--dg-fs-caption)",
                            color:
                              signal.classification === "review_recommended"
                                ? "var(--dg-color-warning)"
                                : "var(--dg-color-text-muted)",
                            fontWeight: signal.classification === "review_recommended" ? 700 : 500,
                            borderBottom: "1px solid var(--dg-color-border-light)",
                          }}
                        >
                          {signal.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3
            style={{
              margin: "0 0 12px",
              fontSize: "var(--dg-fs-body-sm)",
              fontWeight: 700,
              color: "var(--dg-color-text-secondary)",
            }}
          >
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
      <h3
        style={{
          margin: "0 0 12px",
          fontSize: "var(--dg-fs-body-sm)",
          fontWeight: 700,
          color: "var(--dg-color-text-secondary)",
        }}
      >
        All Organizations
      </h3>
      <div style={sectionStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", whiteSpace: "nowrap" }}>
            <thead>
              <tr>
                {[
                  "Name",
                  "Slug",
                  "Status",
                  "Org users",
                  "Employees",
                  "Focus areas",
                  "Certifications",
                  "Roles",
                  "Timezone",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      ...thStyle,
                      borderBottom: "1px solid var(--dg-color-border-light)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {organizations
                .filter((c) => !c.archivedAt)
                .map((c) => {
                  const s = stats.get(c.id);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => onSelectOrg(c.id)}
                      style={{ cursor: "pointer", transition: "background 150ms ease" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          "var(--dg-color-bg-secondary)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <td
                        style={{
                          padding: "10px 14px",
                          fontSize: "var(--dg-fs-label)",
                          fontWeight: 600,
                          color: "var(--dg-color-text-primary)",
                          borderBottom: "1px solid var(--dg-color-border-light)",
                        }}
                      >
                        {c.name}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-muted)",
                          fontFamily: "var(--font-dm-mono), monospace",
                          borderBottom: "1px solid var(--dg-color-border-light)",
                        }}
                      >
                        {c.slug ?? "—"}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          fontSize: "var(--dg-fs-footnote)",
                          borderBottom: "1px solid var(--dg-color-border-light)",
                        }}
                      >
                        {c.suspendedAt ? (
                          <span
                            style={{
                              fontWeight: 600,
                              color: "var(--dg-color-danger)",
                              background: "var(--dg-color-danger-bg)",
                              padding: "1px 6px",
                              borderRadius: "var(--dg-radius-xs)",
                              textTransform: "uppercase",
                            }}
                          >
                            Suspended
                          </span>
                        ) : (
                          <span
                            style={{
                              fontWeight: 600,
                              color: "var(--dg-color-success)",
                              background: "var(--dg-color-success-bg)",
                              padding: "1px 6px",
                              borderRadius: "var(--dg-radius-xs)",
                              textTransform: "uppercase",
                            }}
                          >
                            Active
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          fontSize: "var(--dg-fs-label)",
                          fontWeight: 600,
                          color: "var(--dg-color-text-secondary)",
                          borderBottom: "1px solid var(--dg-color-border-light)",
                        }}
                      >
                        {s?.userCount ?? 0}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          fontSize: "var(--dg-fs-label)",
                          fontWeight: 600,
                          color: "var(--dg-color-text-secondary)",
                          borderBottom: "1px solid var(--dg-color-border-light)",
                        }}
                      >
                        {s?.employeeCount ?? 0}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          fontSize: "var(--dg-fs-caption)",
                          borderBottom: "1px solid var(--dg-color-border-light)",
                        }}
                      >
                        {c.focusAreaLabel && c.focusAreaLabel !== "Focus Areas" ? (
                          <span style={{ color: "var(--dg-color-text-primary)", fontWeight: 600 }}>
                            {c.focusAreaLabel}
                          </span>
                        ) : (
                          <span style={{ color: "var(--dg-color-text-subtle)" }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          fontSize: "var(--dg-fs-caption)",
                          borderBottom: "1px solid var(--dg-color-border-light)",
                        }}
                      >
                        {c.certificationLabel && c.certificationLabel !== "Certifications" ? (
                          <span style={{ color: "var(--dg-color-text-primary)", fontWeight: 600 }}>
                            {c.certificationLabel}
                          </span>
                        ) : (
                          <span style={{ color: "var(--dg-color-text-subtle)" }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          fontSize: "var(--dg-fs-caption)",
                          borderBottom: "1px solid var(--dg-color-border-light)",
                        }}
                      >
                        {c.roleLabel && c.roleLabel !== "Roles" ? (
                          <span style={{ color: "var(--dg-color-text-primary)", fontWeight: 600 }}>
                            {c.roleLabel}
                          </span>
                        ) : (
                          <span style={{ color: "var(--dg-color-text-subtle)" }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-subtle)",
                          borderBottom: "1px solid var(--dg-color-border-light)",
                        }}
                      >
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
