"use client";
import { User } from "lucide-react";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSlideoverClose } from "@/hooks/useSlideoverClose";
import { useQuery } from "@tanstack/react-query";
import CustomSelect from "@/components/CustomSelect";
import { Pagination } from "@/components/ui/pagination";
import GridmasterAccountsView from "@/components/gridmaster/GridmasterAccountsView";
import { fetchGridmasterSecurity, fetchGridmasterSessions } from "@/features/gridmaster/client";
import { formatClientErrorMessage, formatOrganizationRoleLabel } from "@/lib/client-facing";
import { CloseButton } from "@/components/ui/CloseButton";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import { EmptyState } from "@/components/EmptyState";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import { queryKeys } from "@/lib/query-keys";
import { sectionStyle, tdStyle, thStyle } from "@/lib/styles";
import type { GridmasterUserSession, Organization } from "@/types";

function SecurityCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div style={{ ...sectionStyle, padding: "14px 16px", flex: "1 1 170px" }}>
      <div
        style={{
          fontSize: "var(--dg-fs-card-title)",
          fontWeight: 700,
          color: "var(--dg-color-text-primary)",
          fontFamily: "var(--font-dm-mono), monospace",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "var(--dg-fs-caption)",
          fontWeight: 700,
          color: "var(--dg-color-text-muted)",
          marginTop: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "var(--dg-fs-footnote)",
          color: "var(--dg-color-text-subtle)",
          marginTop: 2,
        }}
      >
        {detail}
      </div>
    </div>
  );
}

const SESSION_STATUS_LABELS: Record<GridmasterUserSession["status"], string> = {
  active: "Active",
  recent: "Recent",
  stale: "Stale",
};

const SESSION_STATUS_TONES: Record<GridmasterUserSession["status"], StatusPillTone> = {
  active: "success",
  recent: "warning",
  stale: "neutral",
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

function formatDateGroupLabel(value: string | null | undefined): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Unknown date";
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function groupSessionsByDate(
  sessions: GridmasterUserSession[],
): { dateLabel: string; sessions: GridmasterUserSession[] }[] {
  const groups: { dateLabel: string; sessions: GridmasterUserSession[] }[] = [];
  for (const session of sessions) {
    const dateLabel = formatDateGroupLabel(session.lastActiveAt);
    const currentGroup = groups[groups.length - 1];
    if (currentGroup && currentGroup.dateLabel === dateLabel) {
      currentGroup.sessions.push(session);
    } else {
      groups.push({ dateLabel, sessions: [session] });
    }
  }
  return groups;
}

function statusBadge(status: GridmasterUserSession["status"]) {
  return (
    <StatusPill tone={SESSION_STATUS_TONES[status]}>{SESSION_STATUS_LABELS[status]}</StatusPill>
  );
}

function sessionOrgLabel(session: GridmasterUserSession): string {
  if (session.userPlatformRole === "gridmaster") return "Platform-wide";
  return session.org?.orgName ?? "Unknown org";
}

function sessionMatchesSearch(session: GridmasterUserSession, search: string): boolean {
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
        borderBottom: "1px solid var(--dg-color-border-light)",
      }}
    >
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
      <div
        style={{
          minWidth: 0,
          overflowWrap: "anywhere",
          fontSize: "var(--dg-fs-label)",
          color: "var(--dg-color-text-primary)",
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
  const { closing, close } = useSlideoverClose(onClose);

  return createPortal(
    <>
      <div className={`dg-panel-overlay${closing ? " closing" : ""}`} onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Session details"
        className={`dg-panel${closing ? " closing" : ""}`}
      >
        <div
          style={{
            padding: "18px 20px",
            borderBottom: "1px solid var(--dg-color-border-light)",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "var(--dg-fs-body)",
                fontWeight: 600,
                color: "var(--dg-color-text-primary)",
              }}
            >
              {session.deviceLabel ?? "Unknown device"}
            </div>
            <div
              style={{
                marginTop: 3,
                fontSize: "var(--dg-fs-label)",
                color: "var(--dg-color-text-muted)",
              }}
            >
              {session.userName ?? session.userEmail ?? "Unknown user"} / {sessionOrgLabel(session)}
            </div>
          </div>
          <CloseButton size="md" onClick={close} aria-label="Close session details" />
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: "8px 20px 24px", overflowY: "auto" }}>
          <DetailRow label="Status" value={statusBadge(session.status)} />
          <DetailRow label="User name" value={session.userName ?? "—"} />
          <DetailRow label="User email" value={session.userEmail ?? "Unknown email"} />
          <DetailRow label="User ID" value={session.userId} />
          <DetailRow label="Organization" value={sessionOrgLabel(session)} />
          <DetailRow label="Org ID" value={session.org?.orgId ?? "—"} />
          <DetailRow label="Org slug" value={session.org?.orgSlug ?? "—"} />
          <DetailRow
            label="Org role"
            value={session.org?.orgRole ? formatOrganizationRoleLabel(session.org.orgRole) : "—"}
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
        <ScrollOverflowCue />
      </div>
    </>,
    document.body,
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
  if (!isLoading && sessions.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <EmptyState
          size="compact"
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          }
          title={emptyMessage}
        />
      </div>
    );
  }
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
              <td
                colSpan={7}
                style={{ ...tdStyle, textAlign: "center", color: "var(--dg-color-text-muted)" }}
              >
                Loading
              </td>
            </tr>
          )}
          {!isLoading &&
            groupSessionsByDate(sessions).map((group) => (
              <Fragment key={`group-${group.dateLabel}-${group.sessions[0]?.id}`}>
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: "8px 12px",
                      background: "var(--dg-color-bg-secondary)",
                      fontSize: "var(--dg-type-table-heading-size)",
                      fontWeight: "var(--dg-type-table-heading-weight)",
                      color: "var(--dg-type-table-heading-color)",
                      letterSpacing: "var(--dg-type-table-heading-letter-spacing)",
                      lineHeight: "var(--dg-type-table-heading-line-height)",
                      borderTop: "1px solid var(--dg-color-border-light)",
                      borderBottom: "1px solid var(--dg-color-border-light)",
                    }}
                  >
                    {group.dateLabel}
                  </td>
                </tr>
                {group.sessions.map((session) => (
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
                      <div style={{ fontWeight: 700, color: "var(--dg-color-text-primary)" }}>
                        {session.userName ?? "Unknown user"}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--dg-fs-footnote)",
                          color: "var(--dg-color-text-muted)",
                        }}
                      >
                        {session.userEmail ?? "Unknown email"}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, minWidth: 180 }}>
                      <div
                        style={{
                          color:
                            session.org || session.userPlatformRole === "gridmaster"
                              ? "var(--dg-color-text-primary)"
                              : "var(--dg-color-text-muted)",
                        }}
                      >
                        {sessionOrgLabel(session)}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, minWidth: 190 }}>
                      <div style={{ fontWeight: 700, color: "var(--dg-color-text-primary)" }}>
                        {session.deviceLabel ?? "Unknown device"}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--dg-fs-footnote)",
                          color: "var(--dg-color-text-muted)",
                        }}
                      >
                        {session.platform ?? "unknown"}
                        {session.appVersion ? ` / ${session.appVersion}` : ""}
                      </div>
                    </td>
                    <td style={tdStyle}>{session.ipAddress ?? "—"}</td>
                    <td style={tdStyle}>{formatRelative(session.lastActiveAt)}</td>
                    <td style={tdStyle}>{formatDateTime(session.createdAt)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
        </tbody>
      </table>
    </div>
  );
}

const SESSIONS_PAGE_SIZE = 50;

function GridmasterSessionsPanel({ organizations }: { organizations: Organization[] }) {
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedSession, setSelectedSession] = useState<GridmasterUserSession | null>(null);

  function updateOrgFilter(value: string) {
    setOrgFilter(value);
    setPage(0);
  }
  function updatePlatformFilter(value: string) {
    setPlatformFilter(value);
    setPage(0);
  }
  function updateStatusFilter(value: string) {
    setStatusFilter(value);
    setPage(0);
  }

  const sessionsQuery = useQuery({
    queryKey: queryKeys.gridmaster.sessions(
      page,
      SESSIONS_PAGE_SIZE,
      `${orgFilter}:${platformFilter}`,
    ),
    queryFn: () =>
      fetchGridmasterSessions({
        orgId: orgFilter === "all" ? undefined : orgFilter,
        platform:
          platformFilter === "all"
            ? undefined
            : (platformFilter as "web" | "ios" | "android" | "unknown"),
        limit: SESSIONS_PAGE_SIZE,
        offset: page * SESSIONS_PAGE_SIZE,
      }),
    staleTime: 30_000,
  });
  const sessions = sessionsQuery.data?.sessions ?? [];
  const gridmasterSessions = sessionsQuery.data?.gridmasterSessions ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredSessions = useMemo(
    () =>
      sessions.filter((session) => {
        if (!sessionMatchesSearch(session, normalizedSearch)) return false;
        if (statusFilter !== "all" && session.status !== statusFilter) {
          return false;
        }
        return true;
      }),
    [sessions, normalizedSearch, statusFilter],
  );

  return (
    <>
      <div style={{ ...sectionStyle, marginBottom: 24 }}>
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--dg-color-border-light)",
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
                fontWeight: 600,
                color: "var(--dg-color-text-primary)",
              }}
            >
              User sessions
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-text-muted)",
              }}
            >
              All tracked web and mobile session records, newest first.
            </div>
          </div>
          <span
            aria-live="polite"
            style={{
              fontSize: "var(--dg-fs-caption)",
              color: "var(--dg-color-text-muted)",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-dm-mono), monospace",
            }}
          >
            {sessions.length === 0
              ? "0 sessions"
              : `${page * SESSIONS_PAGE_SIZE + 1}–${page * SESSIONS_PAGE_SIZE + sessions.length}`}
          </span>
        </div>

        {sessionsQuery.error instanceof Error && (
          <div
            style={{
              padding: "12px 16px",
              color: "var(--dg-color-danger)",
              fontSize: "var(--dg-fs-label)",
              fontWeight: 600,
            }}
          >
            {formatClientErrorMessage(
              sessionsQuery.error,
              "We couldn't load your devices. Refresh and try again.",
            )}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            padding: "12px 16px",
            borderBottom: "1px solid var(--dg-color-border-light)",
          }}
        >
          <CustomSelect
            value={orgFilter}
            options={[
              { value: "all", label: "All Organizations" },
              ...organizations.map((org) => ({ value: org.id, label: org.name })),
            ]}
            onChange={updateOrgFilter}
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
            onChange={updatePlatformFilter}
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
            onChange={updateStatusFilter}
            style={{ width: "auto", minWidth: 130 }}
            fontSize={12}
          />
          <div style={{ flex: 1 }} />
          <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 300, minWidth: 180 }}>
            <input
              className="dg-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search sessions..."
              aria-label="Search sessions"
              style={{
                width: "100%",
                paddingRight: search ? 30 : undefined,
                fontSize: "var(--dg-fs-caption)",
              }}
            />
            {search && (
              <CloseButton
                size="sm"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                style={{
                  position: "absolute",
                  right: 4,
                  top: "50%",
                  transform: "translateY(-50%)",
                }}
              />
            )}
          </div>
        </div>

        <SessionsTable
          sessions={filteredSessions}
          isLoading={sessionsQuery.isLoading}
          emptyMessage="No user sessions match those filters"
          onOpen={setSelectedSession}
        />

        <Pagination
          page={page + 1}
          hasNext={sessions.length >= SESSIONS_PAGE_SIZE}
          onPageChange={(next) => setPage(next - 1)}
          className="border-t border-[var(--dg-color-border-light)]"
        />
      </div>
      <div style={{ ...sectionStyle, marginBottom: 24 }}>
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--dg-color-border-light)",
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
                fontWeight: 600,
                color: "var(--dg-color-text-primary)",
              }}
            >
              Gridmaster sessions
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-text-muted)",
              }}
            >
              Platform account sessions, kept separate from organization users.
            </div>
          </div>
          <span
            aria-live="polite"
            style={{
              fontSize: "var(--dg-fs-caption)",
              color: "var(--dg-color-text-muted)",
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
          <SessionDetailPanel session={selectedSession} onClose={() => setSelectedSession(null)} />
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
      <h2
        style={{
          margin: "0 0 16px",
          fontSize: "var(--dg-type-page-title-size)",
          fontWeight: 700,
          color: "var(--dg-color-text-primary)",
        }}
      >
        Security Oversight
      </h2>

      {securityQuery.error instanceof Error && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--dg-color-danger-bg)",
            color: "var(--dg-color-danger)",
            borderRadius: "var(--dg-radius-lg)",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {formatClientErrorMessage(
            securityQuery.error,
            "We couldn't load security oversight. Refresh and try again.",
          )}
        </div>
      )}

      {security && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <SecurityCard
              label="Sessions 24h"
              value={security.sessionSummary.active24h}
              detail={`${security.sessionSummary.stale30d} stale over 30d`}
            />
            <SecurityCard
              label="Mobile Devices"
              value={security.mobileDeviceSummary.active}
              detail={`${security.mobileDeviceSummary.disabled} disabled`}
            />
            <SecurityCard
              label="Active Impersonations"
              value={security.impersonation.activeCount}
              detail={`${security.impersonation.expiredUnendedCount} expired but unended`}
            />
            <SecurityCard
              label="High-Risk Events"
              value={security.highRiskAuditEvents.length}
              detail="Recent audited actions"
            />
          </div>

          <div style={{ ...sectionStyle, marginBottom: 24 }}>
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--dg-color-border-light)",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
                color: "var(--dg-color-text-primary)",
              }}
            >
              Impersonation Governance
            </div>
            {security.impersonation.recent.length === 0 ? (
              <div style={{ padding: 16 }}>
                <EmptyState
                  size="compact"
                  icon={<User size={24} />}
                  title="No impersonation sessions"
                  description="Recent gridmaster impersonations appear here."
                />
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Target</th>
                      <th style={thStyle}>Justification</th>
                      <th style={thStyle}>Started</th>
                      <th style={thStyle}>Ended</th>
                    </tr>
                  </thead>
                  <tbody>
                    {security.impersonation.recent.slice(0, 8).map((entry) => {
                      const active =
                        !entry.endedAt && new Date(entry.expiresAt).getTime() > Date.now();
                      return (
                        <tr key={entry.sessionId}>
                          <td
                            style={{
                              ...tdStyle,
                              fontWeight: 700,
                              color: active
                                ? "var(--dg-color-warning)"
                                : "var(--dg-color-text-muted)",
                            }}
                          >
                            {active ? "Active" : entry.endedAt ? "Ended" : "Expired"}
                          </td>
                          <td style={tdStyle}>{entry.targetUserId.slice(0, 8)}...</td>
                          <td
                            style={{
                              ...tdStyle,
                              maxWidth: 360,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {entry.justification || "—"}
                          </td>
                          <td style={tdStyle}>{new Date(entry.createdAt).toLocaleString()}</td>
                          <td style={tdStyle}>
                            {entry.endedAt ? new Date(entry.endedAt).toLocaleString() : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <GridmasterSessionsPanel organizations={organizations} />

      <GridmasterAccountsView organizations={organizations} currentUserId={currentUserId} />
    </>
  );
}
