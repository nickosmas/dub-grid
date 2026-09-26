"use client";
import { Search } from "lucide-react";

import { useState, useMemo, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PlatformUser, Organization } from "@/types";
import { Button } from "@/components/Button";
import CustomSelect from "@/components/CustomSelect";
import ConfirmDialog from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { sectionStyle, ROLE_BADGE_COLORS } from "@/lib/styles";
import { toDarkPillColors } from "@/lib/colors";
import { formatClientErrorMessage, formatOrganizationRoleLabel } from "@/lib/client-facing";
import { CloseButton } from "@/components/ui/CloseButton";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import { MaybeHint } from "@/components/ui/hint";
import {
  fetchGridmasterUserMemberships,
  fetchGridmasterUsers,
  forceLogoutGridmasterUser,
  sendGridmasterPasswordReset,
  reinstateGridmasterUser,
  terminateGridmasterUser,
  updateGridmasterUserActivation,
} from "@/features/gridmaster/client";
import { queryKeys } from "@/lib/query-keys";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { useSlideoverClose } from "@/hooks/useSlideoverClose";
import { requireCredentialAssurance } from "@/features/account/client";
import {
  gmHeaderStyle,
  gmTableStyle,
  gmTdStyle,
  gmThStyle,
} from "@/components/gridmaster/table-styles";

/**
 * Owns the slide-over's animation, scroll lock, and Escape handling for
 * exactly as long as a user is selected. The panel body itself stays inline
 * in the view because it reads the view's handlers and memoized data.
 */
function UserDetailSlideover({
  onClose,
  children,
}: {
  onClose: () => void;
  children: (close: () => void, closing: boolean) => ReactNode;
}) {
  const { closing, close } = useSlideoverClose(onClose);
  return <>{children(close, closing)}</>;
}

function RoleBadge({ role }: { role: string }) {
  const { resolvedTheme } = useTheme();
  const c0 = ROLE_BADGE_COLORS[role] ?? ROLE_BADGE_COLORS.user;
  // Only the "gridmaster" entry is a literal hex triple (others are already
  // var(--color-*) tokens, which toDarkPillColors can't parse as hex).
  const isDarkTheme = resolvedTheme === "dark";
  const c =
    isDarkTheme && c0.bg.startsWith("#")
      ? { bg: toDarkPillColors(c0.bg).bg, text: toDarkPillColors(c0.bg).text, border: c0.border }
      : c0;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "var(--dg-radius-xs)",
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

function StatusBadge({
  deactivatedAt,
  terminatedAt,
}: {
  deactivatedAt: string | null | undefined;
  terminatedAt?: string | null;
}) {
  if (!deactivatedAt && !terminatedAt) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "var(--dg-radius-xs)",
        background: "var(--dg-color-danger-bg)",
        color: "var(--dg-color-danger)",
        textTransform: "uppercase",
        marginLeft: 4,
      }}
    >
      {terminatedAt ? "Terminated" : "Deactivated"}
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
  const stepUp = useStepUpAction();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState<PlatformUser | null>(null);
  const [forceLogoutConfirm, setForceLogoutConfirm] = useState<PlatformUser | null>(null);
  const [terminateConfirm, setTerminateConfirm] = useState<PlatformUser | null>(null);
  const [terminateReason, setTerminateReason] = useState("");
  const [reinstateConfirm, setReinstateConfirm] = useState<PlatformUser | null>(null);
  const [resetConfirm, setResetConfirm] = useState<PlatformUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null);
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

  const closeUserDetail = useCallback(() => setSelectedUser(null), []);

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
      if (statusFilter === "active" && (u.deactivatedAt || u.terminatedAt)) return false;
      if (statusFilter === "deactivated" && !u.deactivatedAt) return false;
      if (statusFilter === "terminated" && !u.terminatedAt) return false;
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
      const completed = await stepUp.run(async (accessToken) => {
        await requireCredentialAssurance(accessToken);
        await forceLogoutGridmasterUser(user.id, accessToken);
      });
      if (!completed) return;
      toast.success("User sessions terminated");
      setForceLogoutConfirm(null);
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't force logout. Try again."));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleTerminate(user: PlatformUser) {
    const reason = terminateReason.trim();
    if (!reason) {
      toast.error("Give a reason for the termination.");
      return;
    }
    setActionLoading(user.id);
    try {
      const completed = await stepUp.run(async (accessToken) => {
        await requireCredentialAssurance(accessToken);
        await terminateGridmasterUser(user.id, reason, accessToken);
      });
      if (!completed) return;
      toast.success("Account terminated");
      setTerminateConfirm(null);
      setTerminateReason("");
      reload();
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't terminate that account. Try again."));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReinstate(user: PlatformUser) {
    setActionLoading(user.id);
    try {
      const completed = await stepUp.run(async (accessToken) => {
        await requireCredentialAssurance(accessToken);
        await reinstateGridmasterUser(user.id, accessToken);
      });
      if (!completed) return;
      toast.success("Account reinstated. Grant organization access again to let them back in.");
      setReinstateConfirm(null);
      reload();
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't reinstate that account. Try again."));
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePasswordReset(user: PlatformUser) {
    if (!user.email) return;
    setActionLoading(user.id);
    try {
      const email = user.email;
      const completed = await stepUp.run(async (accessToken) => {
        await requireCredentialAssurance(accessToken);
        await sendGridmasterPasswordReset(email, accessToken);
      });
      if (!completed) return;
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
                borderBottom: "1px solid var(--dg-color-border-light)",
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
          fontSize: "var(--dg-type-page-title-size)",
          fontWeight: 700,
          color: "var(--dg-color-text-primary)",
        }}
      >
        All Users
      </h2>

      {usersQuery.error instanceof Error && (
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
            usersQuery.error,
            "We couldn't load users. Refresh and try again.",
          )}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              fontSize: "var(--dg-type-field-title-size)",
              fontWeight: "var(--dg-type-field-title-weight)",
              color: "var(--dg-type-field-title-color)",
              textTransform: "none",
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
            style={{ flex: "1 1 auto" }}
            fontSize={12}
          />
          <CustomSelect
            value={orgFilter}
            options={[
              { value: "all", label: "All Organizations" },
              ...organizations.map((c) => ({ value: c.id, label: c.name })),
            ]}
            onChange={setOrgFilter}
            style={{ flex: "1 1 auto" }}
            fontSize={12}
          />
          <CustomSelect
            value={statusFilter}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "active", label: "Active" },
              { value: "deactivated", label: "Deactivated" },
              { value: "terminated", label: "Terminated" },
              { value: "inactive", label: "Never Logged In" },
            ]}
            onChange={setStatusFilter}
            style={{ flex: "1 1 auto" }}
            fontSize={12}
          />
          {(search || roleFilter !== "all" || orgFilter !== "all" || statusFilter !== "all") && (
            <Button
              onClick={() => {
                setSearch("");
                setRoleFilter("all");
                setOrgFilter("all");
                setStatusFilter("all");
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--dg-color-today-text)",
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              Clear
            </Button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            aria-live="polite"
            style={{
              fontSize: "var(--dg-fs-caption)",
              color: "var(--dg-color-text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            Showing {filtered.length} of {users.length}
          </span>
          <div style={{ position: "relative", minWidth: 180, maxWidth: 240 }}>
            <Search
              size={13}
              strokeWidth={2.5}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--dg-color-text-faint)",
              }}
            />
            <input
              className="dg-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              style={{
                paddingLeft: 32,
                paddingRight: search ? 30 : 12,
                fontSize: "var(--dg-fs-caption)",
                background: "var(--dg-color-surface)",
                border: "1px solid var(--dg-color-border-light)",
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
      </div>

      {/* Table */}
      {filtered.length > 0 ? (
        <div style={sectionStyle}>
          <div style={{ overflowX: "auto" }}>
            <table style={gmTableStyle}>
              <thead>
                <tr>
                  <th style={gmHeaderStyle("Email")}>Email</th>
                  <th style={gmHeaderStyle("Platform role")}>Platform role</th>
                  <th style={gmHeaderStyle("Organization role")}>Organization role</th>
                  <th style={gmHeaderStyle("Organization")}>Organization</th>
                  <th style={gmHeaderStyle("Sessions")}>Sessions</th>
                  <th style={gmHeaderStyle("Mobile")}>Mobile</th>
                  <th style={gmHeaderStyle("Memberships")}>Memberships</th>
                  <th style={gmHeaderStyle("Last login")}>Last login</th>
                  <th style={gmHeaderStyle("Date joined")}>Date joined</th>
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
                      <td
                        style={{ ...gmTdStyle, fontWeight: 600, fontSize: "var(--dg-fs-caption)" }}
                      >
                        {u.email ?? "—"}
                        <StatusBadge
                          deactivatedAt={u.deactivatedAt as string | null}
                          terminatedAt={u.terminatedAt}
                        />
                      </td>
                      <td style={gmTdStyle}>
                        {u.platformRole !== "none" && <RoleBadge role={u.platformRole} />}
                      </td>
                      <td style={gmTdStyle}>{u.orgRole && <RoleBadge role={u.orgRole} />}</td>
                      <td style={gmTdStyle}>
                        {u.orgName ? (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (u.orgId) onNavigateToOrg(u.orgId);
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--dg-color-info)",
                              cursor: "pointer",
                              fontSize: "var(--dg-fs-label)",
                              fontWeight: 500,
                              fontFamily: "inherit",
                              padding: 0,
                              textDecoration: "underline",
                              whiteSpace: "normal",
                              textAlign: "left",
                            }}
                          >
                            {u.orgName}
                          </Button>
                        ) : (
                          <span style={{ color: "var(--dg-color-text-muted)" }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          ...gmTdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        {u.activeSessionCount ?? 0}
                      </td>
                      <td
                        style={{
                          ...gmTdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        {u.mobileDeviceCount ?? 0}
                      </td>
                      <td
                        style={{
                          ...gmTdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        {u.membershipCount ?? (u.orgId ? 1 : 0)}
                      </td>
                      <td
                        style={{
                          ...gmTdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-muted)",
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
                          ...gmTdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-muted)",
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

      {/* Terminate confirm: the reason is recorded on the account and in the audit log. */}
      {terminateConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Terminate account"
          message={
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span>
                Terminate &quot;{terminateConfirm.email}&quot;? They lose every organization
                membership and every session now, and no organization admin can invite, reactivate,
                or re-add them. Only a gridmaster can reinstate the account.
              </span>
              <textarea
                className="dg-input"
                aria-label="Termination reason"
                placeholder="Reason (required, recorded in the audit log)"
                value={terminateReason}
                onChange={(event) => setTerminateReason(event.target.value)}
                rows={3}
                style={{ resize: "vertical" }}
              />
            </div>
          }
          confirmLabel="Terminate account"
          variant="danger"
          isLoading={actionLoading === terminateConfirm.id}
          onConfirm={() => handleTerminate(terminateConfirm)}
          onCancel={() => {
            setTerminateConfirm(null);
            setTerminateReason("");
          }}
        />
      )}

      {/* Reinstate confirm */}
      {reinstateConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Reinstate account"
          message={`Reinstate "${reinstateConfirm.email}"? This lifts the platform block only. Their memberships stay archived until you grant organization access again.`}
          confirmLabel="Reinstate"
          variant="info"
          isLoading={actionLoading === reinstateConfirm.id}
          onConfirm={() => handleReinstate(reinstateConfirm)}
          onCancel={() => setReinstateConfirm(null)}
        />
      )}

      {/* Force logout confirm */}
      {forceLogoutConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Force logout"
          message={`Terminate all sessions for "${forceLogoutConfirm.email}"? They will need to log in again.`}
          confirmLabel="Force logout"
          variant="danger"
          isLoading={actionLoading === forceLogoutConfirm.id}
          onConfirm={() => handleForceLogout(forceLogoutConfirm)}
          onCancel={() => setForceLogoutConfirm(null)}
        />
      )}
      {stepUp.dialog}

      {/* Password reset confirm */}
      {resetConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Send Password Reset"
          message={`Send a password reset email to "${resetConfirm.email}"?`}
          confirmLabel="Send reset email"
          variant="info"
          isLoading={actionLoading === resetConfirm.id}
          onConfirm={() => handlePasswordReset(resetConfirm)}
          onCancel={() => setResetConfirm(null)}
        />
      )}

      {/* User detail side panel */}
      {selectedUser && (
        <UserDetailSlideover onClose={closeUserDetail}>
          {(handleClosePanel, closing) => {
            // Read the live row so the panel reflects an action (terminate,
            // deactivate) as soon as the list reloads, not the snapshot it opened with.
            const u = users.find((candidate) => candidate.id === selectedUser.id) ?? selectedUser;
            const isDeactivated = !!u.deactivatedAt;
            const isGM = u.platformRole === "gridmaster";
            const emailName = u.email?.split("@")[0] ?? "";
            const initials = emailName.slice(0, 2).toUpperCase();
            const badgeColor = isGM
              ? "var(--dg-color-brand)"
              : (ROLE_BADGE_COLORS[u.orgRole ?? "user"]?.bg ?? "var(--dg-color-bg-secondary)");
            return createPortal(
              <>
                <div
                  className={`dg-panel-overlay${closing ? " closing" : ""}`}
                  onClick={handleClosePanel}
                />
                <div
                  className={`dg-panel dg-panel--x-wide${closing ? " closing" : ""}`}
                  role="dialog"
                  aria-modal="true"
                  aria-label="User detail"
                >
                  {/* Header */}
                  <div className="staff-detail-header">
                    <CloseButton
                      size="md"
                      className="self-end"
                      onClick={handleClosePanel}
                      aria-label="Close detail panel"
                    />
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: "50%",
                        background: badgeColor,
                        color: "var(--dg-color-text-inverse)",
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
                        color: "var(--dg-color-text-primary)",
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
                      {(isDeactivated || u.terminatedAt) && (
                        <StatusBadge
                          deactivatedAt={u.deactivatedAt as string | null}
                          terminatedAt={u.terminatedAt}
                        />
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      overflowY: "auto",
                      padding: 20,
                      display: "flex",
                      flexDirection: "column",
                      gap: 20,
                    }}
                  >
                    {/* Info grid */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "14px 24px",
                        fontSize: "var(--dg-fs-label)",
                        padding: 16,
                        background: "var(--dg-color-bg)",
                        borderRadius: "var(--dg-radius-md)",
                      }}
                    >
                      <div>
                        <span
                          style={{
                            color: "var(--dg-type-field-title-color)",
                            fontSize: "var(--dg-type-field-title-size)",
                            fontWeight: "var(--dg-type-field-title-weight)",
                            textTransform: "none",
                            letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                          }}
                        >
                          Last Login
                        </span>
                        <div
                          style={{
                            color: "var(--dg-color-text-primary)",
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
                            color: "var(--dg-type-field-title-color)",
                            fontSize: "var(--dg-type-field-title-size)",
                            fontWeight: "var(--dg-type-field-title-weight)",
                            textTransform: "none",
                            letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                          }}
                        >
                          Date Joined
                        </span>
                        <div
                          style={{
                            color: "var(--dg-color-text-primary)",
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
                              color: "var(--dg-type-field-title-color)",
                              fontSize: "var(--dg-type-field-title-size)",
                              fontWeight: "var(--dg-type-field-title-weight)",
                              textTransform: "none",
                              letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                            }}
                          >
                            Current Org
                          </span>
                          <div style={{ marginTop: 2 }}>
                            <Button
                              onClick={() => {
                                handleClosePanel();
                                setTimeout(() => u.orgId && onNavigateToOrg(u.orgId), 220);
                              }}
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--dg-color-info)",
                                cursor: "pointer",
                                fontSize: "var(--dg-fs-label)",
                                fontWeight: 500,
                                fontFamily: "inherit",
                                padding: 0,
                                textDecoration: "underline",
                              }}
                            >
                              {u.orgName}
                            </Button>
                          </div>
                        </div>
                      )}
                      <div>
                        <span
                          style={{
                            color: "var(--dg-type-field-title-color)",
                            fontSize: "var(--dg-type-field-title-size)",
                            fontWeight: "var(--dg-type-field-title-weight)",
                            textTransform: "none",
                            letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                          }}
                        >
                          User ID
                        </span>
                        <div
                          style={{
                            color: "var(--dg-color-text-muted)",
                            marginTop: 2,
                            fontSize: "var(--dg-fs-footnote)",
                            fontFamily: "var(--font-dm-mono), monospace",
                          }}
                        >
                          {u.id}
                        </div>
                      </div>
                      <div>
                        <span
                          style={{
                            color: "var(--dg-type-field-title-color)",
                            fontSize: "var(--dg-type-field-title-size)",
                            fontWeight: "var(--dg-type-field-title-weight)",
                            textTransform: "none",
                            letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                          }}
                        >
                          Active Sessions
                        </span>
                        <div
                          style={{
                            color: "var(--dg-color-text-primary)",
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
                            color: "var(--dg-type-field-title-color)",
                            fontSize: "var(--dg-type-field-title-size)",
                            fontWeight: "var(--dg-type-field-title-weight)",
                            textTransform: "none",
                            letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                          }}
                        >
                          Mobile Devices
                        </span>
                        <div
                          style={{
                            color: "var(--dg-color-text-primary)",
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
                            color: "var(--dg-type-field-title-color)",
                            fontSize: "var(--dg-type-field-title-size)",
                            fontWeight: "var(--dg-type-field-title-weight)",
                            textTransform: "none",
                            letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                          }}
                        >
                          Last Force Logout
                        </span>
                        <div
                          style={{
                            color: "var(--dg-color-text-primary)",
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
                            color: "var(--dg-color-text-primary)",
                          }}
                        >
                          Organization Memberships
                        </h4>
                        {membershipsLoading ? (
                          <table style={gmTableStyle} aria-hidden>
                            <thead>
                              <tr>
                                <th style={gmHeaderStyle("Organization")}>Organization</th>
                                <th style={gmHeaderStyle("Role")}>Role</th>
                                <th style={gmHeaderStyle("Date joined")}>Date joined</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from({ length: 3 }).map((_, i) => (
                                <tr key={i}>
                                  <td style={gmTdStyle}>
                                    <div
                                      className="dg-skeleton"
                                      style={{
                                        width: "70%",
                                        height: 12,
                                        borderRadius: "var(--dg-radius-xs)",
                                      }}
                                    />
                                  </td>
                                  <td style={gmTdStyle}>
                                    <div
                                      className="dg-skeleton"
                                      style={{ width: 64, height: 18, borderRadius: 999 }}
                                    />
                                  </td>
                                  <td style={gmTdStyle}>
                                    <div
                                      className="dg-skeleton"
                                      style={{
                                        width: 96,
                                        height: 12,
                                        borderRadius: "var(--dg-radius-xs)",
                                      }}
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
                              color: "var(--dg-color-danger)",
                              fontSize: "var(--dg-fs-label)",
                            }}
                          >
                            {formatClientErrorMessage(
                              membershipsQuery.error,
                              "We couldn't load memberships. Refresh and try again.",
                            )}
                          </div>
                        ) : (
                          <table style={gmTableStyle}>
                            <thead>
                              <tr>
                                <th style={gmHeaderStyle("Organization")}>Organization</th>
                                <th style={gmHeaderStyle("Role")}>Role</th>
                                <th style={gmHeaderStyle("Date joined")}>Date joined</th>
                              </tr>
                            </thead>
                            <tbody>
                              {memberships.map((m) => (
                                <tr key={m.org_id}>
                                  <td style={{ ...gmTdStyle, fontWeight: 600 }}>
                                    <Button
                                      onClick={() => {
                                        handleClosePanel();
                                        setTimeout(() => onNavigateToOrg(m.org_id), 220);
                                      }}
                                      style={{
                                        background: "none",
                                        border: "none",
                                        color: "var(--dg-color-info)",
                                        cursor: "pointer",
                                        fontSize: "var(--dg-fs-label)",
                                        fontWeight: 600,
                                        fontFamily: "inherit",
                                        padding: 0,
                                        textDecoration: "underline",
                                      }}
                                    >
                                      {m.org_name}
                                    </Button>
                                  </td>
                                  <td style={gmTdStyle}>
                                    <RoleBadge role={m.org_role} />
                                  </td>
                                  <td
                                    style={{
                                      ...gmTdStyle,
                                      fontSize: "var(--dg-fs-caption)",
                                      color: "var(--dg-color-text-muted)",
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

                    {u.terminatedAt && (
                      <div
                        role="note"
                        style={{
                          padding: "12px 16px",
                          borderRadius: "var(--dg-radius-lg)",
                          background: "var(--dg-color-danger-bg)",
                          color: "var(--dg-color-danger)",
                          fontSize: "var(--dg-fs-label)",
                          fontWeight: 600,
                        }}
                      >
                        Terminated {formatRelativeDate(u.terminatedAt)}
                        {u.terminatedReason ? `: ${u.terminatedReason}` : ""}. Organization admins
                        cannot invite, reactivate, or re-add this account.
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
                          borderTop: "1px solid var(--dg-color-border-light)",
                        }}
                      >
                        {u.terminatedAt ? (
                          <Button
                            className="dg-btn dg-btn-secondary"
                            style={{
                              fontSize: "var(--dg-fs-label)",
                              color: "var(--dg-color-success, green)",
                            }}
                            onClick={() => setReinstateConfirm(u)}
                            disabled={actionLoading === u.id}
                          >
                            Reinstate
                          </Button>
                        ) : (
                          <Button
                            className="dg-btn dg-btn-secondary"
                            style={{ fontSize: "var(--dg-fs-label)" }}
                            onClick={() => {
                              handleClosePanel();
                              setTimeout(() => onImpersonate(u.id, u.orgId ?? undefined), 220);
                            }}
                          >
                            Impersonate
                          </Button>
                        )}
                        {u.orgId && !u.terminatedAt && (
                          <Button
                            className="dg-btn dg-btn-secondary"
                            style={{
                              fontSize: "var(--dg-fs-label)",
                              color: isDeactivated
                                ? "var(--dg-color-success, green)"
                                : "var(--dg-color-warning, orange)",
                            }}
                            onClick={() => setDeactivateConfirm(u)}
                            disabled={actionLoading === u.id}
                          >
                            {isDeactivated ? "Reactivate" : "Deactivate"}
                          </Button>
                        )}
                        <Button
                          className="dg-btn dg-btn-secondary"
                          style={{
                            fontSize: "var(--dg-fs-label)",
                            color: "var(--dg-color-danger)",
                          }}
                          onClick={() => setForceLogoutConfirm(u)}
                          disabled={actionLoading === u.id}
                        >
                          Force Logout
                        </Button>
                        {u.email && !u.terminatedAt && (
                          <Button
                            className="dg-btn dg-btn-secondary"
                            style={{ fontSize: "var(--dg-fs-label)" }}
                            onClick={() => setResetConfirm(u)}
                            disabled={actionLoading === u.id}
                          >
                            Reset Password
                          </Button>
                        )}
                        {!u.terminatedAt && (
                          <Button
                            className="dg-btn dg-btn-danger"
                            style={{ fontSize: "var(--dg-fs-label)", marginLeft: "auto" }}
                            onClick={() => setTerminateConfirm(u)}
                            disabled={actionLoading === u.id}
                          >
                            Terminate account
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <ScrollOverflowCue />
                </div>
              </>,
              document.body,
            );
          }}
        </UserDetailSlideover>
      )}
    </>
  );
}
