"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import CustomSelect from "@/components/CustomSelect";
import GridmasterAccountsView from "@/components/gridmaster/GridmasterAccountsView";
import {
  fetchGridmasterSecurity,
  fetchGridmasterSessions,
} from "@/features/gridmaster/client";
import {
  formatClientErrorMessage,
  formatOrganizationRoleLabel,
} from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { sectionStyle, tdStyle, thStyle } from "@/lib/styles";
import type { GridmasterUserSession, Organization } from "@/types";

function SecurityCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div style={{ ...sectionStyle, padding: "14px 16px", flex: "1 1 170px" }}>
      <div style={{ fontSize: "var(--dg-fs-card-title)", fontWeight: 800, color: "var(--color-text-primary)", fontFamily: "var(--font-dm-mono), monospace" }}>{value}</div>
      <div style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 700, color: "var(--color-text-muted)", marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-subtle)", marginTop: 2 }}>{detail}</div>
    </div>
  );
}

const SESSION_STATUS_LABELS: Record<GridmasterUserSession["status"], string> = {
  active: "Active",
  recent: "Recent",
  stale: "Stale",
};

const SESSION_STATUS_STYLES: Record<
  GridmasterUserSession["status"],
  { bg: string; text: string; border: string }
> = {
  active: {
    bg: "var(--color-success-bg)",
    text: "var(--color-success)",
    border: "var(--color-success-border)",
  },
  recent: {
    bg: "var(--color-warning-bg)",
    text: "var(--color-warning)",
    border: "var(--color-warning-border)",
  },
  stale: {
    bg: "var(--color-bg-secondary)",
    text: "var(--color-text-muted)",
    border: "var(--color-border)",
  },
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "—";
  const minutes = Math.floor((Date.now() - time) / 60_000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(value);
}

function statusBadge(status: GridmasterUserSession["status"]) {
  const colors = SESSION_STATUS_STYLES[status];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 4,
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
      }}
    >
      {SESSION_STATUS_LABELS[status]}
    </span>
  );
}

function sessionOrgLabel(session: GridmasterUserSession): string {
  if (session.userPlatformRole === "gridmaster") return "Platform-wide";
  return session.org?.orgName ?? "Unknown org";
}

function sessionMatchesSearch(
  session: GridmasterUserSession,
  search: string,
): boolean {
  if (!search) return true;
  const haystack = [
    session.userName,
    session.userEmail,
    session.userId,
    session.deviceLabel,
    session.ipAddress,
    session.platform,
    session.org?.orgName,
    session.org?.orgSlug,
    session.org?.orgRole ? formatOrganizationRoleLabel(session.org.orgRole) : null,
    session.userPlatformRole === "gridmaster" ? "gridmaster platform-wide" : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(search);
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px minmax(0, 1fr)",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid var(--color-border-light)",
      }}
    >
      <div
        style={{
          fontSize: "var(--dg-fs-footnote)",
          fontWeight: 700,
          color: "var(--color-text-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          minWidth: 0,
          overflowWrap: "anywhere",
          fontSize: "var(--dg-fs-label)",
          color: "var(--color-text-primary)",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function SessionDetailPanel({
  session,
  onClose,
}: {
  session: GridmasterUserSession;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Session details"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(15, 23, 42, 0.32)",
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          height: "100%",
          background: "var(--color-surface)",
          boxShadow: "-16px 0 48px rgba(15, 23, 42, 0.18)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            padding: "18px 20px",
            borderBottom: "1px solid var(--color-border-light)",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "var(--dg-fs-body)",
                fontWeight: 800,
                color: "var(--color-text-primary)",
              }}
            >
              {session.deviceLabel ?? "Unknown device"}
            </div>
            <div
              style={{
                marginTop: 3,
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-muted)",
              }}
            >
              {session.userName ?? session.userEmail ?? "Unknown user"} / {sessionOrgLabel(session)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="dg-btn dg-btn-ghost dg-btn-sm"
          >
            Close
          </button>
        </div>
        <div style={{ padding: "8px 20px 24px", overflowY: "auto" }}>
          <DetailRow label="Status" value={statusBadge(session.status)} />
          <DetailRow label="User name" value={session.userName ?? "—"} />
          <DetailRow label="User email" value={session.userEmail ?? "Unknown email"} />
          <DetailRow label="User ID" value={session.userId} />
          <DetailRow label="Organization" value={sessionOrgLabel(session)} />
          <DetailRow label="Org ID" value={session.org?.orgId ?? "—"} />
          <DetailRow label="Org slug" value={session.org?.orgSlug ?? "—"} />
          <DetailRow
            label="Org role"
            value={
              session.org?.orgRole
                ? formatOrganizationRoleLabel(session.org.orgRole)
                : "—"
            }
          />
          <DetailRow label="Registry ID" value={session.id} />
          <DetailRow label="Supabase session" value={session.supabaseSessionId ?? "—"} />
          <DetailRow label="Platform" value={session.platform ?? "unknown"} />
          <DetailRow label="App version" value={session.appVersion ?? "—"} />
          <DetailRow label="Device" value={session.deviceLabel ?? "Unknown device"} />
          <DetailRow label="IP address" value={session.ipAddress ?? "—"} />
          <DetailRow label="Last active" value={formatDateTime(session.lastActiveAt)} />
          <DetailRow label="Created" value={formatDateTime(session.createdAt)} />
        </div>
      </div>
    </div>
  );
}

function SessionsTable({
  sessions,
  isLoading,
  emptyMessage,
  onOpen,
}: {
  sessions: GridmasterUserSession[];
  isLoading: boolean;
  emptyMessage: string;
  onOpen: (session: GridmasterUserSession) => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>User</th>
            <th style={thStyle}>Organization</th>
            <th style={thStyle}>Device</th>
            <th style={thStyle}>IP</th>
            <th style={thStyle}>Last active</th>
            <th style={thStyle}>Created</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "var(--color-text-muted)" }}>
                Loading sessions...
              </td>
            </tr>
          )}
          {!isLoading && sessions.length === 0 && (
            <tr>
              <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "var(--color-text-muted)" }}>
                {emptyMessage}
              </td>
            </tr>
          )}
          {!isLoading &&
            sessions.map((session) => (
              <tr
                key={session.id}
                role="button"
                tabIndex={0}
                aria-label={`Open session details for ${session.userEmail ?? "unknown user"}`}
                onClick={() => onOpen(session)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(session);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <td style={tdStyle}>{statusBadge(session.status)}</td>
                <td style={{ ...tdStyle, minWidth: 220 }}>
                  <div style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>
                    {session.userName ?? "Unknown user"}
                  </div>
                  <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>
                    {session.userEmail ?? "Unknown email"}
                  </div>
                </td>
                <td style={{ ...tdStyle, minWidth: 180 }}>
                  <div style={{ color: session.org || session.userPlatformRole === "gridmaster" ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                    {sessionOrgLabel(session)}
                  </div>
                </td>
                <td style={{ ...tdStyle, minWidth: 190 }}>
                  <div style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>
                    {session.deviceLabel ?? "Unknown device"}
                  </div>
                  <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>
                    {session.platform ?? "unknown"}
                    {session.appVersion ? ` / ${session.appVersion}` : ""}
                  </div>
                </td>
                <td style={tdStyle}>{session.ipAddress ?? "—"}</td>
                <td style={tdStyle}>{formatRelative(session.lastActiveAt)}</td>
                <td style={tdStyle}>{formatDateTime(session.createdAt)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function GridmasterSessionsPanel({
  organizations,
}: {
  organizations: Organization[];
}) {
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedSession, setSelectedSession] =
    useState<GridmasterUserSession | null>(null);
  const sessionsQuery = useQuery({
    queryKey: queryKeys.gridmaster.sessions(),
    queryFn: fetchGridmasterSessions,
    staleTime: 30_000,
  });
  const sessions = sessionsQuery.data?.sessions ?? [];
  const gridmasterSessions = sessionsQuery.data?.gridmasterSessions ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredSessions = useMemo(
    () =>
      sessions.filter((session) => {
        if (!sessionMatchesSearch(session, normalizedSearch)) return false;
        if (
          orgFilter !== "all" &&
          session.org?.orgId !== orgFilter
        ) {
          return false;
        }
        if (platformFilter !== "all") {
          if (platformFilter === "unknown" && session.platform !== null) {
            return false;
          }
          if (platformFilter !== "unknown" && session.platform !== platformFilter) {
            return false;
          }
        }
        if (statusFilter !== "all" && session.status !== statusFilter) {
          return false;
        }
        return true;
      }),
    [sessions, normalizedSearch, orgFilter, platformFilter, statusFilter],
  );

  return (
    <>
      <div style={{ ...sectionStyle, marginBottom: 24 }}>
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--color-border-light)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <div
              style={{
                fontSize: "var(--dg-fs-label)",
                fontWeight: 800,
                color: "var(--color-text-primary)",
              }}
            >
              User sessions
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--color-text-muted)",
              }}
            >
              All tracked web and mobile session records.
            </div>
          </div>
          <span
            aria-live="polite"
            style={{
              fontSize: "var(--dg-fs-caption)",
              color: "var(--color-text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            Showing {filteredSessions.length} of {sessions.length}
          </span>
        </div>

        {sessionsQuery.error instanceof Error && (
          <div style={{ padding: "12px 16px", color: "var(--color-danger)", fontSize: "var(--dg-fs-label)", fontWeight: 600 }}>
            {formatClientErrorMessage(sessionsQuery.error, "Failed to load sessions")}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            padding: "12px 16px",
            borderBottom: "1px solid var(--color-border-light)",
          }}
        >
          <CustomSelect
            value={orgFilter}
            options={[
              { value: "all", label: "All Organizations" },
              ...organizations.map((org) => ({ value: org.id, label: org.name })),
            ]}
            onChange={setOrgFilter}
            style={{ width: "auto", minWidth: 170 }}
            fontSize={12}
          />
          <CustomSelect
            value={platformFilter}
            options={[
              { value: "all", label: "All Platforms" },
              { value: "web", label: "Web" },
              { value: "ios", label: "iOS" },
              { value: "android", label: "Android" },
              { value: "unknown", label: "Unknown" },
            ]}
            onChange={setPlatformFilter}
            style={{ width: "auto", minWidth: 140 }}
            fontSize={12}
          />
          <CustomSelect
            value={statusFilter}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "active", label: "Active" },
              { value: "recent", label: "Recent" },
              { value: "stale", label: "Stale" },
            ]}
            onChange={setStatusFilter}
            style={{ width: "auto", minWidth: 130 }}
            fontSize={12}
          />
          <div style={{ flex: 1 }} />
          <input
            className="dg-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search sessions..."
            aria-label="Search sessions"
            style={{
              flex: "1 1 220px",
              maxWidth: 300,
              minWidth: 180,
              fontSize: "var(--dg-fs-caption)",
            }}
          />
        </div>

        <SessionsTable
          sessions={filteredSessions}
          isLoading={sessionsQuery.isLoading}
          emptyMessage="No user sessions match those filters"
          onOpen={setSelectedSession}
        />
      </div>
      <div style={{ ...sectionStyle, marginBottom: 24 }}>
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--color-border-light)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <div
              style={{
                fontSize: "var(--dg-fs-label)",
                fontWeight: 800,
                color: "var(--color-text-primary)",
              }}
            >
              Gridmaster sessions
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--color-text-muted)",
              }}
            >
              Platform account sessions, kept separate from organization users.
            </div>
          </div>
          <span
            aria-live="polite"
            style={{
              fontSize: "var(--dg-fs-caption)",
              color: "var(--color-text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            {gridmasterSessions.length} tracked
          </span>
        </div>

        <SessionsTable
          sessions={gridmasterSessions}
          isLoading={sessionsQuery.isLoading}
          emptyMessage="No gridmaster sessions tracked"
          onOpen={setSelectedSession}
        />
        {selectedSession && (
          <SessionDetailPanel
            session={selectedSession}
            onClose={() => setSelectedSession(null)}
          />
        )}
      </div>
    </>
  );
}

export default function GridmasterSecurityView({
  organizations,
  currentUserId,
}: {
  organizations: Organization[];
  currentUserId: string | null | undefined;
}) {
  const securityQuery = useQuery({
    queryKey: queryKeys.gridmaster.security(),
    queryFn: fetchGridmasterSecurity,
    staleTime: 30_000,
  });
  const security = securityQuery.data;

  return (
    <>
      <h2 style={{ margin: "0 0 16px", fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)" }}>
        Security Oversight
      </h2>

      {securityQuery.error instanceof Error && (
        <div style={{ padding: "12px 16px", background: "var(--color-danger-bg)", color: "var(--color-danger)", borderRadius: "var(--dg-radius-lg)", fontSize: "var(--dg-fs-label)", fontWeight: 600, marginBottom: 16 }}>
          {formatClientErrorMessage(securityQuery.error, "Failed to load security oversight")}
        </div>
      )}

      {security && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <SecurityCard label="Sessions 24h" value={security.sessionSummary.active24h} detail={`${security.sessionSummary.stale30d} stale over 30d`} />
            <SecurityCard label="Mobile Devices" value={security.mobileDeviceSummary.active} detail={`${security.mobileDeviceSummary.disabled} disabled`} />
            <SecurityCard label="Active Impersonations" value={security.impersonation.activeCount} detail={`${security.impersonation.expiredUnendedCount} expired but unended`} />
            <SecurityCard label="High-Risk Events" value={security.highRiskAuditEvents.length} detail="Recent audited actions" />
          </div>

          <div style={{ ...sectionStyle, marginBottom: 24 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-light)", fontSize: "var(--dg-fs-label)", fontWeight: 800, color: "var(--color-text-primary)" }}>Impersonation Governance</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr><th style={thStyle}>Status</th><th style={thStyle}>Target</th><th style={thStyle}>Justification</th><th style={thStyle}>Started</th><th style={thStyle}>Ended</th></tr>
                </thead>
                <tbody>
                  {security.impersonation.recent.slice(0, 8).map((entry) => {
                    const active = !entry.endedAt && new Date(entry.expiresAt).getTime() > Date.now();
                    return (
                      <tr key={entry.sessionId}>
                        <td style={{ ...tdStyle, fontWeight: 700, color: active ? "var(--color-warning)" : "var(--color-text-muted)" }}>{active ? "Active" : entry.endedAt ? "Ended" : "Expired"}</td>
                        <td style={tdStyle}>{entry.targetUserId.slice(0, 8)}...</td>
                        <td style={{ ...tdStyle, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.justification || "—"}</td>
                        <td style={tdStyle}>{new Date(entry.createdAt).toLocaleString()}</td>
                        <td style={tdStyle}>{entry.endedAt ? new Date(entry.endedAt).toLocaleString() : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <GridmasterSessionsPanel organizations={organizations} />

      <GridmasterAccountsView organizations={organizations} currentUserId={currentUserId} />
    </>
  );
}
