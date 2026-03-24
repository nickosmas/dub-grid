"use client";

import type { Employee, AuditLogEntry, Invitation } from "@/types";
import { sectionStyle, sectionHeaderStyle, sectionBodyStyle, thStyle, tdStyle, ROLE_BADGE_COLORS } from "@/lib/styles";
import { formatRelativeTime } from "@/lib/utils";

interface ActivityTabProps {
  employee: Employee;
  roleHistory: AuditLogEntry[];
  invitations: Invitation[];
}

export function ActivityTab({
  employee,
  roleHistory,
  invitations,
}: ActivityTabProps) {
  const statusDays = employee.statusChangedAt
    ? Math.floor((Date.now() - new Date(employee.statusChangedAt).getTime()) / 86400000)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Status History */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Employment Status</div>
        <div style={sectionBodyStyle}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <StatusDot status={employee.status} />
              <div style={{ width: 2, height: 40, background: "var(--color-border-light)", borderStyle: "dashed" }} />
            </div>
            <div>
              <div style={{ fontSize: "var(--dg-fs-body-sm)", fontWeight: 600, color: "var(--color-text-primary)" }}>
                {employee.status.charAt(0).toUpperCase() + employee.status.slice(1)}
              </div>
              {employee.statusChangedAt && (
                <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", marginTop: 2 }}>
                  Since {new Date(employee.statusChangedAt).toLocaleDateString()} ({statusDays} day{statusDays !== 1 ? "s" : ""} ago)
                </div>
              )}
              {employee.statusNote && (
                <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-secondary)", marginTop: 4, fontStyle: "italic" }}>
                  {employee.statusNote}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Role Change History */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          Role Changes
          <span style={{ fontWeight: 500, color: "var(--color-text-faint)", marginLeft: 8, fontSize: "var(--dg-fs-caption)" }}>
            {roleHistory.length}
          </span>
        </div>
        {!employee.userId ? (
          <EmptyState
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>}
            text="No linked user account — role history not available"
          />
        ) : roleHistory.length === 0 ? (
          <EmptyState
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
            text="No role changes recorded"
          />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>From</th>
                <th style={thStyle}>To</th>
                <th style={thStyle}>Changed By</th>
              </tr>
            </thead>
            <tbody>
              {roleHistory.map((entry) => (
                <tr key={entry.id} className="dg-table-row">
                  <td style={tdStyle}>
                    <div style={{ fontSize: "var(--dg-fs-body-sm)" }}>
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </div>
                    <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-faint)" }}>
                      {formatRelativeTime(entry.createdAt)}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <RoleBadge role={entry.fromRole} />
                  </td>
                  <td style={tdStyle}>
                    <RoleBadge role={entry.toRole} />
                  </td>
                  <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                    {entry.changedByEmail ?? "System"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invitation History */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          Invitations
          <span style={{ fontWeight: 500, color: "var(--color-text-faint)", marginLeft: 8, fontSize: "var(--dg-fs-caption)" }}>
            {invitations.length}
          </span>
        </div>
        {invitations.length === 0 ? (
          <EmptyState
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,7 12,13 2,7" /></svg>}
            text="No invitations sent"
          />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Sent</th>
                <th style={thStyle}>Expires</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => {
                const isExpired = !inv.acceptedAt && !inv.revokedAt && new Date(inv.expiresAt) < new Date();
                const status = inv.acceptedAt
                  ? "accepted"
                  : inv.revokedAt
                  ? "revoked"
                  : isExpired
                  ? "expired"
                  : "pending";

                const statusColors = {
                  accepted: { bg: "var(--color-success-bg)", text: "var(--color-success-text)" },
                  revoked: { bg: "var(--color-danger-bg)", text: "var(--color-danger-text)" },
                  expired: { bg: "var(--color-border-light)", text: "var(--color-text-muted)" },
                  pending: { bg: "var(--color-warning-bg)", text: "var(--color-warning-text)" },
                }[status];

                return (
                  <tr key={inv.id} className="dg-table-row">
                    <td style={tdStyle}>{inv.email}</td>
                    <td style={{ ...tdStyle, textTransform: "capitalize" }}>{inv.roleToAssign}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          fontSize: "var(--dg-fs-badge)",
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 10,
                          background: statusColors.bg,
                          color: statusColors.text,
                          textTransform: "capitalize",
                        }}
                      >
                        {status}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "var(--color-success)",
    benched: "var(--color-warning)",
    terminated: "var(--color-danger)",
  };
  const color = colors[status] ?? "var(--color-border)";
  return (
    <div
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        marginTop: 4,
        boxShadow: `0 0 0 3px ${color === "var(--color-success)" ? "#22C55E33" : color === "var(--color-warning)" ? "#F59E0B33" : "#EF444433"}`,
      }}
    />
  );
}

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_BADGE_COLORS[role] ?? ROLE_BADGE_COLORS.user;
  return (
    <span
      style={{
        fontSize: "var(--dg-fs-badge)",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 10,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
      }}
    >
      {role.replace("_", " ")}
    </span>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{
      ...sectionBodyStyle,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 20px",
      gap: 8,
    }}>
      <span style={{ color: "var(--color-text-faint)", opacity: 0.5 }}>{icon}</span>
      <span style={{ color: "var(--color-text-faint)", fontSize: "var(--dg-fs-caption)" }}>{text}</span>
    </div>
  );
}
