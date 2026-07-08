"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PlatformUser, Organization } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import ConfirmDialog from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { sectionStyle, thStyle, tdStyle, ROLE_BADGE_COLORS } from "@/lib/styles";
import { formatClientErrorMessage, formatOrganizationRoleLabel } from "@/lib/client-facing";
import { MaybeHint } from "@/components/ui/hint";
import {
  fetchGridmasterUserMemberships,
  fetchGridmasterUsers,
  forceLogoutGridmasterUser,
  updateGridmasterUserActivation,
} from "@/features/gridmaster/client";
import { queryKeys } from "@/lib/query-keys";

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_BADGE_COLORS[role] ?? ROLE_BADGE_COLORS.user;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      {formatOrganizationRoleLabel(role)}
    </span>
  );
}

function StatusBadge({ deactivatedAt }: { deactivatedAt: string | null | undefined }) {
  if (!deactivatedAt) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        background: "var(--color-danger-bg)",
        color: "var(--color-danger)",
        textTransform: "uppercase",
        marginLeft: 4,
      }}
    >
      Deactivated
    </span>
  );
}

function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export default function AllUsersView({
  organizations,
  onNavigateToOrg,
  onImpersonate,
}: {
  organizations: Organization[];
  onNavigateToOrg: (orgId: string) => void;
  onImpersonate: (userId: string, orgId?: string) => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState<PlatformUser | null>(null);
  const [forceLogoutConfirm, setForceLogoutConfirm] = useState<PlatformUser | null>(null);
  const [resetConfirm, setResetConfirm] = useState<PlatformUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null);
  const [closing, setClosing] = useState(false);
  const usersQuery = useQuery({
    queryKey: queryKeys.gridmaster.allUsers(),
    queryFn: fetchGridmasterUsers,
    staleTime: 30_000,
  });
  const users = usersQuery.data?.users ?? [];
  const membershipsQuery = useQuery({
    queryKey: selectedUser
      ? queryKeys.gridmaster.userMemberships(selectedUser.id)
      : queryKeys.gridmaster.userMemberships("none"),
    queryFn: async () => {
      if (!selectedUser) return [];
      const { memberships: data } = await fetchGridmasterUserMemberships(selectedUser.id);
      return (data ?? []).map((row) => ({
        org_id: row.orgId,
        org_role: row.orgRole,
        joined_at: row.joinedAt,
        org_name: row.orgName,
      }));
    },
    enabled: selectedUser != null,
    staleTime: 30_000,
  });
  const memberships = membershipsQuery.data ?? [];
  const membershipsLoading = membershipsQuery.isLoading;

  const handleClosePanel = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setSelectedUser(null);
    }, 200);
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClosePanel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selectedUser, handleClosePanel]);

  function reload() {
    queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.allUsers() });
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      if (u.platformRole === "gridmaster") return false;
      if (q && !(u.email ?? "").toLowerCase().includes(q)) return false;
      if (roleFilter !== "all") {
        if (u.orgRole !== roleFilter) return false;
      }
      if (orgFilter !== "all" && u.orgId !== orgFilter) return false;
      if (statusFilter === "active" && u.deactivatedAt) return false;
      if (statusFilter === "deactivated" && !u.deactivatedAt) return false;
      if (statusFilter === "inactive" && u.lastSignInAt) return false;
      return true;
    });
  }, [users, search, roleFilter, orgFilter, statusFilter]);

  async function handleDeactivate(user: PlatformUser) {
    if (!user.orgId) return;
    setActionLoading(user.id);
    try {
      const isDeactivated = !!user.deactivatedAt;
      if (!user.orgId) {
        throw new Error("Missing organization for this user.");
      }
      await updateGridmasterUserActivation({
        userId: user.id,
        orgId: user.orgId,
        deactivate: !isDeactivated,
      });
      if (isDeactivated) {
        toast.success("User reactivated");
      } else {
        toast.success("User deactivated");
      }
      setDeactivateConfirm(null);
      reload();
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "Action failed"));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleForceLogout(user: PlatformUser) {
    setActionLoading(user.id);
    try {
      await forceLogoutGridmasterUser(user.id);
      toast.success("User sessions terminated");
      setForceLogoutConfirm(null);
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "Failed to force logout"));
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePasswordReset(user: PlatformUser) {
    if (!user.email) return;
    setActionLoading(user.id);
    try {
      const res = await fetch("/api/gridmaster/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          formatClientErrorMessage(body.error, "We couldn't send that password reset."),
        );
      }
      toast.success(`Password reset email sent to ${user.email}`);
      setResetConfirm(null);
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't send that password reset."));
    } finally {
      setActionLoading(null);
    }
  }

  function handleSelectUser(user: PlatformUser) {
    setSelectedUser(user);
  }

  if (usersQuery.isLoading) {
    return (
      <div>
        <div className="dg-skeleton dg-skeleton--heading" style={{ marginBottom: 16 }} />
        <div style={sectionStyle}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 16,
                padding: "12px 14px",
                borderBottom: "1px solid var(--color-border-light)",
              }}
            >
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "25%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "12%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "12%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "18%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "10%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "10%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "13%" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <h2
        style={{
          margin: "0 0 16px",
          fontSize: "var(--dg-fs-page-title)",
          fontWeight: 700,
          color: "var(--color-text-primary)",
        }}
      >
        All Users
      </h2>

      {usersQuery.error instanceof Error && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--color-danger-bg)",
            color: "var(--color-danger)",
            borderRadius: "var(--dg-radius-lg)",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {formatClientErrorMessage(usersQuery.error, "Failed to load users")}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              fontSize: "var(--dg-fs-footnote)",
              fontWeight: 700,
              color: "var(--color-text-subtle)",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Filter
          </span>
          <CustomSelect
            value={roleFilter}
            options={[
              { value: "all", label: "All Roles" },
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
          <CustomSelect
            value={statusFilter}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "active", label: "Active" },
              { value: "deactivated", label: "Deactivated" },
              { value: "inactive", label: "Never Logged In" },
            ]}
            onChange={setStatusFilter}
            style={{ width: "auto", minWidth: 150 }}
            fontSize={12}
          />
          {(search || roleFilter !== "all" || orgFilter !== "all" || statusFilter !== "all") && (
            <button
              onClick={() => {
                setSearch("");
                setRoleFilter("all");
                setOrgFilter("all");
                setStatusFilter("all");
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-today-text)",
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              Clear
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            aria-live="polite"
            style={{
              fontSize: "var(--dg-fs-caption)",
              color: "var(--color-text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            Showing {filtered.length} of {users.length}
          </span>
          <div style={{ position: "relative", minWidth: 180, maxWidth: 240 }}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-text-faint)",
              }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="dg-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              style={{
                paddingLeft: 32,
                fontSize: "var(--dg-fs-caption)",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border-light)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Table */}
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
                  <th style={thStyle}>Sessions</th>
                  <th style={thStyle}>Mobile</th>
                  <th style={thStyle}>Memberships</th>
                  <th style={thStyle}>Last Login</th>
                  <th style={thStyle}>Date Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isDeactivated = !!u.deactivatedAt;
                  return (
                    <tr
                      key={u.id}
                      style={{ opacity: isDeactivated ? 0.6 : 1, cursor: "pointer" }}
                      onClick={() => handleSelectUser(u)}
                    >
                      <td style={{ ...tdStyle, fontWeight: 600, fontSize: "var(--dg-fs-caption)" }}>
                        {u.email ?? "—"}
                        <StatusBadge deactivatedAt={u.deactivatedAt as string | null} />
                      </td>
                      <td style={tdStyle}>
                        {u.platformRole !== "none" && <RoleBadge role={u.platformRole} />}
                      </td>
                      <td style={tdStyle}>{u.orgRole && <RoleBadge role={u.orgRole} />}</td>
                      <td style={tdStyle}>
                        {u.orgName ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (u.orgId) onNavigateToOrg(u.orgId);
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--color-info)",
                              cursor: "pointer",
                              fontSize: "var(--dg-fs-label)",
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
                      <td
                        style={{
                          ...tdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        {u.activeSessionCount ?? 0}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        {u.mobileDeviceCount ?? 0}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        {u.membershipCount ?? (u.orgId ? 1 : 0)}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--color-text-muted)",
                          whiteSpace: "nowrap",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        <MaybeHint
                          content={
                            u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "Never"
                          }
                          side="bottom"
                        >
                          <span>{formatRelativeDate(u.lastSignInAt)}</span>
                        </MaybeHint>
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--color-text-muted)",
                          whiteSpace: "nowrap",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        {new Date(u.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
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
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
          title="No users found"
          description="There are no matching users for these filters."
        />
      )}

      {/* Deactivate/Reactivate confirm */}
      {deactivateConfirm && (
        <ConfirmDialog
          title={!!deactivateConfirm.deactivatedAt ? "Reactivate User" : "Deactivate User"}
          message={
            !!deactivateConfirm.deactivatedAt
              ? `Reactivate "${deactivateConfirm.email}"? They will regain platform access.`
              : `Deactivate "${deactivateConfirm.email}"? They will be blocked from logging in across all orgs.`
          }
          confirmLabel={!!deactivateConfirm.deactivatedAt ? "Reactivate" : "Deactivate"}
          variant={!!deactivateConfirm.deactivatedAt ? "info" : "danger"}
          isLoading={actionLoading === deactivateConfirm.id}
          onConfirm={() => handleDeactivate(deactivateConfirm)}
          onCancel={() => setDeactivateConfirm(null)}
        />
      )}

      {/* Force logout confirm */}
      {forceLogoutConfirm && (
        <ConfirmDialog
          title="Force Logout"
          message={`Terminate all sessions for "${forceLogoutConfirm.email}"? They will need to log in again.`}
          confirmLabel="Force Logout"
          variant="danger"
          isLoading={actionLoading === forceLogoutConfirm.id}
          onConfirm={() => handleForceLogout(forceLogoutConfirm)}
          onCancel={() => setForceLogoutConfirm(null)}
        />
      )}

      {/* Password reset confirm */}
      {resetConfirm && (
        <ConfirmDialog
          title="Send Password Reset"
          message={`Send a password reset email to "${resetConfirm.email}"?`}
          confirmLabel="Send Reset Email"
          variant="info"
          isLoading={actionLoading === resetConfirm.id}
          onConfirm={() => handlePasswordReset(resetConfirm)}
          onCancel={() => setResetConfirm(null)}
        />
      )}

      {/* User detail side panel */}
      {selectedUser &&
        (() => {
          const u = selectedUser;
          const isDeactivated = !!u.deactivatedAt;
          const isGM = u.platformRole === "gridmaster";
          const emailName = u.email?.split("@")[0] ?? "";
          const initials = emailName.slice(0, 2).toUpperCase();
          const badgeColor = isGM
            ? "var(--color-brand)"
            : (ROLE_BADGE_COLORS[u.orgRole ?? "user"]?.bg ?? "var(--color-bg-secondary)");
          return (
            <>
              <div
                className={`staff-detail-overlay${closing ? " closing" : ""}`}
                onClick={handleClosePanel}
              />
              <div className={`staff-detail-pane${closing ? " closing" : ""}`}>
                {/* Header */}
                <div className="staff-detail-header">
                  <button className="staff-detail-close" onClick={handleClosePanel}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      background: badgeColor,
                      color: "#fff",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "var(--dg-fs-body)",
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                      marginBottom: 10,
                    }}
                  >
                    {initials}
                  </div>
                  <h3
                    style={{
                      margin: "0 0 6px",
                      fontSize: "var(--dg-fs-body-sm)",
                      fontWeight: 700,
                      color: "var(--color-text-primary)",
                      textAlign: "center",
                      wordBreak: "break-all",
                    }}
                  >
                    {u.email ?? "Unknown"}
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      flexWrap: "wrap",
                      justifyContent: "center",
                    }}
                  >
                    {isGM && <RoleBadge role={u.platformRole} />}
                    {!isGM && u.orgRole && <RoleBadge role={u.orgRole} />}
                    {isDeactivated && <StatusBadge deactivatedAt={u.deactivatedAt as string} />}
                  </div>
                </div>

                {/* Content */}
                <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
                  {/* Info grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "14px 24px",
                      fontSize: "var(--dg-fs-label)",
                      padding: 16,
                      background: "var(--color-bg)",
                      borderRadius: "var(--dg-radius-md)",
                    }}
                  >
                    <div>
                      <span
                        style={{
                          color: "var(--color-text-muted)",
                          fontSize: "var(--dg-fs-footnote)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Last Login
                      </span>
                      <div
                        style={{
                          color: "var(--color-text-primary)",
                          marginTop: 2,
                          fontWeight: 500,
                        }}
                      >
                        {formatRelativeDate(u.lastSignInAt)}
                      </div>
                    </div>
                    <div>
                      <span
                        style={{
                          color: "var(--color-text-muted)",
                          fontSize: "var(--dg-fs-footnote)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Date Joined
                      </span>
                      <div
                        style={{
                          color: "var(--color-text-primary)",
                          marginTop: 2,
                          fontWeight: 500,
                        }}
                      >
                        {new Date(u.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                    </div>
                    {u.orgName && (
                      <div>
                        <span
                          style={{
                            color: "var(--color-text-muted)",
                            fontSize: "var(--dg-fs-footnote)",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          Current Org
                        </span>
                        <div style={{ marginTop: 2 }}>
                          <button
                            onClick={() => {
                              handleClosePanel();
                              setTimeout(() => u.orgId && onNavigateToOrg(u.orgId), 220);
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--color-info)",
                              cursor: "pointer",
                              fontSize: "var(--dg-fs-label)",
                              fontWeight: 500,
                              fontFamily: "inherit",
                              padding: 0,
                              textDecoration: "underline",
                            }}
                          >
                            {u.orgName}
                          </button>
                        </div>
                      </div>
                    )}
                    <div>
                      <span
                        style={{
                          color: "var(--color-text-muted)",
                          fontSize: "var(--dg-fs-footnote)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        User ID
                      </span>
                      <div
                        style={{
                          color: "var(--color-text-muted)",
                          marginTop: 2,
                          fontSize: "var(--dg-fs-footnote)",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        {u.id.slice(0, 8)}…
                      </div>
                    </div>
                    <div>
                      <span
                        style={{
                          color: "var(--color-text-muted)",
                          fontSize: "var(--dg-fs-footnote)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Active Sessions
                      </span>
                      <div
                        style={{
                          color: "var(--color-text-primary)",
                          marginTop: 2,
                          fontWeight: 500,
                        }}
                      >
                        {u.activeSessionCount ?? 0}
                      </div>
                    </div>
                    <div>
                      <span
                        style={{
                          color: "var(--color-text-muted)",
                          fontSize: "var(--dg-fs-footnote)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Mobile Devices
                      </span>
                      <div
                        style={{
                          color: "var(--color-text-primary)",
                          marginTop: 2,
                          fontWeight: 500,
                        }}
                      >
                        {u.mobileDeviceCount ?? 0}
                      </div>
                    </div>
                    <div>
                      <span
                        style={{
                          color: "var(--color-text-muted)",
                          fontSize: "var(--dg-fs-footnote)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Last Force Logout
                      </span>
                      <div
                        style={{
                          color: "var(--color-text-primary)",
                          marginTop: 2,
                          fontWeight: 500,
                        }}
                      >
                        {formatRelativeDate(u.lastForceLogoutAt)}
                      </div>
                    </div>
                  </div>

                  {/* Memberships */}
                  {(membershipsLoading || memberships.length > 0) && (
                    <div>
                      <h4
                        style={{
                          margin: "0 0 8px",
                          fontSize: "var(--dg-fs-caption)",
                          fontWeight: 700,
                          color: "var(--color-text-primary)",
                        }}
                      >
                        Organization Memberships
                      </h4>
                      {membershipsLoading ? (
                        <table style={{ width: "100%", borderCollapse: "collapse" }} aria-hidden>
                          <thead>
                            <tr>
                              <th style={thStyle}>Organization</th>
                              <th style={thStyle}>Role</th>
                              <th style={thStyle}>Date Joined</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: 3 }).map((_, i) => (
                              <tr key={i}>
                                <td style={tdStyle}>
                                  <div
                                    className="dg-skeleton"
                                    style={{ width: "70%", height: 12, borderRadius: 4 }}
                                  />
                                </td>
                                <td style={tdStyle}>
                                  <div
                                    className="dg-skeleton"
                                    style={{ width: 64, height: 18, borderRadius: 999 }}
                                  />
                                </td>
                                <td style={tdStyle}>
                                  <div
                                    className="dg-skeleton"
                                    style={{ width: 96, height: 12, borderRadius: 4 }}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : membershipsQuery.error instanceof Error ? (
                        <div
                          style={{
                            padding: 16,
                            color: "var(--color-danger)",
                            fontSize: "var(--dg-fs-label)",
                          }}
                        >
                          {formatClientErrorMessage(
                            membershipsQuery.error,
                            "Failed to load memberships",
                          )}
                        </div>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              <th style={thStyle}>Organization</th>
                              <th style={thStyle}>Role</th>
                              <th style={thStyle}>Date Joined</th>
                            </tr>
                          </thead>
                          <tbody>
                            {memberships.map((m) => (
                              <tr key={m.org_id}>
                                <td style={{ ...tdStyle, fontWeight: 600 }}>
                                  <button
                                    onClick={() => {
                                      handleClosePanel();
                                      setTimeout(() => onNavigateToOrg(m.org_id), 220);
                                    }}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      color: "var(--color-info)",
                                      cursor: "pointer",
                                      fontSize: "var(--dg-fs-label)",
                                      fontWeight: 600,
                                      fontFamily: "inherit",
                                      padding: 0,
                                      textDecoration: "underline",
                                    }}
                                  >
                                    {m.org_name}
                                  </button>
                                </td>
                                <td style={tdStyle}>
                                  <RoleBadge role={m.org_role} />
                                </td>
                                <td
                                  style={{
                                    ...tdStyle,
                                    fontSize: "var(--dg-fs-caption)",
                                    color: "var(--color-text-muted)",
                                  }}
                                >
                                  {new Date(m.joined_at).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  {!isGM && (
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        paddingTop: 16,
                        borderTop: "1px solid var(--color-border-light)",
                      }}
                    >
                      <button
                        className="dg-btn dg-btn-secondary"
                        style={{ fontSize: "var(--dg-fs-label)" }}
                        onClick={() => {
                          handleClosePanel();
                          setTimeout(() => onImpersonate(u.id, u.orgId ?? undefined), 220);
                        }}
                      >
                        Impersonate
                      </button>
                      {u.orgId && (
                        <button
                          className="dg-btn dg-btn-secondary"
                          style={{
                            fontSize: "var(--dg-fs-label)",
                            color: isDeactivated
                              ? "var(--color-success, green)"
                              : "var(--color-warning, orange)",
                          }}
                          onClick={() => setDeactivateConfirm(u)}
                          disabled={actionLoading === u.id}
                        >
                          {isDeactivated ? "Reactivate" : "Deactivate"}
                        </button>
                      )}
                      <button
                        className="dg-btn dg-btn-secondary"
                        style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-danger)" }}
                        onClick={() => setForceLogoutConfirm(u)}
                        disabled={actionLoading === u.id}
                      >
                        Force Logout
                      </button>
                      {u.email && (
                        <button
                          className="dg-btn dg-btn-secondary"
                          style={{ fontSize: "var(--dg-fs-label)" }}
                          onClick={() => setResetConfirm(u)}
                          disabled={actionLoading === u.id}
                        >
                          Reset Password
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          );
        })()}
    </>
  );
}
