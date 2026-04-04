"use client";

import React, { useState, useEffect } from "react";
import { AdminPermissions, OrganizationUser, OrganizationRole } from "@/types";
import { fetchOrganizationUsers, changeOrganizationUserRole, updateAdminPermissions, fetchInvitations, revokeInvitation, resendInvitation } from "@/lib/db";
import { toast } from "sonner";
import { useMediaQuery, MOBILE } from "@/hooks";
import ConfirmDialog from "@/components/ConfirmDialog";
import { queueNotification } from "@/lib/notify";
import { useAuth } from "@/components/AuthProvider";
import CustomSelect from "@/components/CustomSelect";
import { labelStyle } from "./shared";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

// ── Admin permission metadata ──────────────────────────────────────────────────

const PERM_GROUPS: { label: string; keys: (keyof AdminPermissions)[] }[] = [
  { label: "Schedule", keys: ["canEditShifts", "canPublishSchedule", "canApplyRecurringSchedule", "canApproveShiftRequests"] },
  { label: "Notes", keys: ["canEditNotes"] },
  { label: "Recurring", keys: ["canManageRecurringShifts", "canManageShiftSeries"] },
  { label: "Staff", keys: ["canManageEmployees"] },
  { label: "Configuration", keys: ["canManageFocusAreas", "canManageShiftCodes", "canManageIndicatorTypes", "canManageOrgSettings", "canManageOrgLabels", "canManageCoverageRequirements"] },
];

const PERM_LABELS: Record<keyof AdminPermissions, string> = {
  canViewSchedule: "View Schedule",
  canEditShifts: "Edit Shifts",
  canPublishSchedule: "Publish Schedule",
  canApplyRecurringSchedule: "Apply Recurring Schedule",
  canEditNotes: "Edit Notes / Indicators",
  canManageRecurringShifts: "Manage Recurring Shifts",
  canManageShiftSeries: "Manage Shift Series",
  canViewStaff: "View Staff",
  canManageEmployees: "Manage Employees",
  canManageFocusAreas: "Manage Focus Areas",
  canManageShiftCodes: "Manage Shift Codes",
  canManageIndicatorTypes: "Manage Indicator Types",
  canManageOrgSettings: "Manage Organization Settings",
  canManageOrgLabels: "Manage Custom Labels",
  canManageCoverageRequirements: "Manage Coverage Requirements",
  canApproveShiftRequests: "Approve Shift Requests",
};

/** Permissions that are always on and cannot be toggled off. */
const ALWAYS_ON = new Set<keyof AdminPermissions>(["canViewSchedule"]);

/** Permissions that only super_admin can hold — hidden from admin permissions editor. */
const SUPER_ADMIN_ONLY = new Set<keyof AdminPermissions>(["canManageOrgSettings"]);

function emptyAdminPerms(): AdminPermissions {
  return {
    canViewSchedule: true,
    canEditShifts: false,
    canPublishSchedule: false,
    canApplyRecurringSchedule: false,
    canEditNotes: false,
    canManageRecurringShifts: false,
    canManageShiftSeries: false,
    canViewStaff: true,
    canManageEmployees: false,
    canManageFocusAreas: false,
    canManageShiftCodes: false,
    canManageIndicatorTypes: false,
    canManageOrgSettings: false,
    canManageOrgLabels: false,
    canManageCoverageRequirements: false,
    canApproveShiftRequests: false,
  };
}

export default function UserManagementSettings({ orgId, isSuperAdmin }: { orgId: string; isSuperAdmin: boolean }) {
  const { user: currentUser } = useAuth();
  const isMobile = useMediaQuery(MOBILE);
  const myRole = isSuperAdmin ? "super_admin" : "user";
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [editingPerms, setEditingPerms] = useState<Record<string, AdminPermissions>>({});
  const [savingPerms, setSavingPerms] = useState<string | null>(null);
  const [roleChangeConfirm, setRoleChangeConfirm] = useState<{
    userId: string; userName: string; from: OrganizationRole; to: OrganizationRole;
  } | null>(null);

  // Invitations
  const [invitations, setInvitations] = useState<import("@/types").Invitation[]>([]);
  const [showInvitations, setShowInvitations] = useState(false);
  const [invitationAction, setInvitationAction] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchOrganizationUsers(orgId)
      .then((u) => { if (mounted) { setUsers(u); setLoading(false); } })
      .catch((e) => { if (mounted) { setError(e.message); setLoading(false); } });
    fetchInvitations(orgId)
      .then((inv) => { if (mounted) setInvitations(inv); })
      .catch(() => {});
    return () => { mounted = false; };
  }, [orgId]);

  const handleRoleChange = async (userId: string, newRole: OrganizationRole) => {
    setSaving(userId);
    setError(null);
    try {
      const target = users.find((u) => u.id === userId);
      const oldRole = target?.orgRole ?? "user";
      await changeOrganizationUserRole(userId, newRole, orgId, target?.email ?? undefined);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, orgRole: newRole } : u));
      if (newRole === "user") setExpandedUserId((prev) => prev === userId ? null : prev);
      toast.success("Role updated");
      queueNotification({
        action: "role_changed",
        orgId,
        targetUserId: userId,
        fromRole: oldRole,
        toRole: newRole,
      });
    } catch (e) {
      toast.error("Failed to change role");
      setError(e instanceof Error ? e.message : "Failed to change role");
    } finally {
      setSaving(null);
    }
  };

  const requestRoleChange = (user: OrganizationUser, newRole: OrganizationRole) => {
    if (newRole === user.orgRole) return;
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "User";
    setRoleChangeConfirm({ userId: user.id, userName: displayName, from: user.orgRole, to: newRole });
  };

  const confirmRoleChange = () => {
    if (!roleChangeConfirm) return;
    handleRoleChange(roleChangeConfirm.userId, roleChangeConfirm.to);
    setRoleChangeConfirm(null);
  };

  const openPermissions = (user: OrganizationUser) => {
    if (expandedUserId === user.id) { setExpandedUserId(null); return; }
    setExpandedUserId(user.id);
    if (!editingPerms[user.id]) {
      setEditingPerms((prev) => ({
        ...prev,
        [user.id]: { ...emptyAdminPerms(), ...(user.adminPermissions ?? {}) },
      }));
    }
  };

  const handlePermToggle = (userId: string, key: keyof AdminPermissions, value: boolean) => {
    setEditingPerms((prev) => ({ ...prev, [userId]: { ...prev[userId], [key]: value } }));
  };

  const handlePermsSave = async (userId: string) => {
    setSavingPerms(userId);
    setError(null);
    try {
      await updateAdminPermissions(userId, editingPerms[userId], orgId, users.find((u) => u.id === userId)?.email ?? undefined);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, adminPermissions: editingPerms[userId] } : u));
      toast.success("Permissions saved");
    } catch (e) {
      toast.error("Failed to save permissions");
      setError(e instanceof Error ? e.message : "Failed to save permissions");
    } finally {
      setSavingPerms(null);
    }
  };

  const ROLE_LABELS: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    user: "User",
  };

  const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
    super_admin: { bg: "var(--color-brand-bg)", text: "var(--color-brand)" },
    admin: { bg: "var(--color-brand-bg)", text: "var(--color-brand)" },
    user: { bg: "var(--color-border-light)", text: "var(--color-text-muted)" },
  };

  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const ROLE_ORDER: Record<string, number> = { super_admin: 0, admin: 1, user: 2 };

  const sortedUsers = [...users]
    .filter((u) => {
      if (roleFilter !== "all" && u.orgRole !== roleFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ").toLowerCase();
        const email = (u.email ?? "").toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Pin logged-in user to the top
      const aIsYou = !!(currentUser && a.id === currentUser.id);
      const bIsYou = !!(currentUser && b.id === currentUser.id);
      if (aIsYou !== bIsYou) return aIsYou ? -1 : 1;

      const ra = ROLE_ORDER[a.orgRole] ?? 3;
      const rb = ROLE_ORDER[b.orgRole] ?? 3;
      if (ra !== rb) return ra - rb;
      const nameA = [a.firstName, a.lastName].filter(Boolean).join(" ") || a.email || "";
      const nameB = [b.firstName, b.lastName].filter(Boolean).join(" ") || b.email || "";
      return nameA.localeCompare(nameB);
    });

  if (loading) {
    return <p style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>Loading users…</p>;
  }

  const roleChangeMessage = roleChangeConfirm ? (() => {
    const toLabel = ROLE_LABELS[roleChangeConfirm.to] ?? roleChangeConfirm.to;
    const fromLabel = ROLE_LABELS[roleChangeConfirm.from] ?? roleChangeConfirm.from;
    if (roleChangeConfirm.to === "super_admin") {
      return `Promote "${roleChangeConfirm.userName}" to Super Admin? They will have full control over this organization.`;
    }
    if (roleChangeConfirm.to === "admin") {
      return `Promote "${roleChangeConfirm.userName}" from ${fromLabel} to Admin? You can configure their permissions afterward.`;
    }
    return `Change "${roleChangeConfirm.userName}" from ${fromLabel} to ${toLabel}? They will lose any admin permissions.`;
  })() : "";

  const roleChangeVariant: "danger" | "warning" | "info" = roleChangeConfirm
    ? roleChangeConfirm.to === "super_admin" ? "warning"
      : roleChangeConfirm.to === "user" && roleChangeConfirm.from !== "user" ? "warning"
      : "info"
    : "info";

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 12, padding: 10, background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", borderRadius: 8, color: "var(--color-danger-text)", fontSize: "var(--dg-fs-label)" }}>
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        {/* Left group: filter */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 700, color: "var(--color-text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>Filter</span>
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
          {(search || roleFilter !== "all") && (
            <button
              onClick={() => { setSearch(""); setRoleFilter("all"); }}
              style={{
                background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-today-text)", fontSize: "var(--dg-fs-caption)",
                fontWeight: 600, cursor: "pointer", padding: "4px 10px", fontFamily: "inherit",
              }}
            >
              Clear
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Right group: count + search */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
            {sortedUsers.length} of {users.length}
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
              style={{ paddingLeft: 32, fontSize: "var(--dg-fs-caption)", background: "var(--color-surface)", border: "1px solid var(--color-border-light)" }}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4 text-[11px] tracking-wide uppercase text-muted-foreground">Name</TableHead>
              <TableHead className="text-[11px] tracking-wide uppercase text-muted-foreground">Role</TableHead>
              <TableHead className="hidden md:table-cell text-[11px] tracking-wide uppercase text-muted-foreground">Joined</TableHead>
              <TableHead className="hidden md:table-cell text-[11px] tracking-wide uppercase text-muted-foreground">Last Login</TableHead>
              <TableHead className="w-10 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedUsers.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-10 text-center text-[13px] text-muted-foreground">
                  {search || roleFilter !== "all" ? "No users match your filters" : "No users found"}
                </TableCell>
              </TableRow>
            )}

            {sortedUsers.map((user) => {
              const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "—";
              const roleColor = ROLE_COLORS[user.orgRole] ?? ROLE_COLORS.user;
              const isSuperAdminUser = user.orgRole === "super_admin";
              const isExpanded = expandedUserId === user.id;
              const savedPerms = { ...emptyAdminPerms(), ...(user.adminPermissions ?? {}) };
              const perms = editingPerms[user.id] ?? savedPerms;
              const allPermKeys = PERM_GROUPS.flatMap((g) => g.keys);
              const hasUnsavedChanges = isExpanded && editingPerms[user.id] != null &&
                allPermKeys.some((key) => editingPerms[user.id][key] !== savedPerms[key]);

              return (
                <React.Fragment key={user.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => openPermissions(user)}
                  >
                    {/* Name + Email */}
                    <TableCell className="pl-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-white" style={{ background: "var(--color-brand)" }}>
                          {(displayName !== "—" ? displayName : "?")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[13px] font-medium text-foreground truncate">
                            {displayName}
                            {currentUser && user.id === currentUser.id && (
                              <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-[var(--color-brand-bg)] text-[var(--color-brand)] shrink-0">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {user.email ?? "—"}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Role */}
                    <TableCell className="py-3">
                      <span
                        className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap"
                        style={{ background: roleColor.bg, color: roleColor.text }}
                      >
                        {ROLE_LABELS[user.orgRole] ?? user.orgRole}
                      </span>
                    </TableCell>

                    {/* Joined */}
                    <TableCell className="hidden md:table-cell py-3 text-[12px] text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </TableCell>

                    {/* Last Login */}
                    <TableCell className="hidden md:table-cell py-3 text-[12px] text-muted-foreground">
                      {formatDate(user.lastSignInAt)}
                    </TableCell>

                    {/* Chevron */}
                    <TableCell className="pr-4 py-3">
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className="text-muted-foreground/50 transition-transform duration-150"
                        style={{ transform: isExpanded ? "rotate(180deg)" : "none" }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </TableCell>
                  </TableRow>

                  {/* Expanded permissions panel */}
                  {isExpanded && (
                    <TableRow className="hover:bg-transparent border-0">
                      <TableCell colSpan={5} className="p-0">
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            padding: isMobile ? "12px 12px 12px 16px" : "12px 16px 16px 52px",
                            display: "flex", flexDirection: "column", gap: 12,
                          }}
                        >
                          {/* Role selector */}
                          {myRole === "super_admin" && !isSuperAdminUser && (
                            <div>
                              <label style={labelStyle}>ROLE</label>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <CustomSelect
                                  value={user.orgRole}
                                  options={[
                                    { value: "user", label: "User" },
                                    { value: "admin", label: "Admin" },
                                    { value: "super_admin", label: "Super Admin" },
                                  ]}
                                  onChange={(v) => requestRoleChange(user, v as OrganizationRole)}
                                  disabled={saving === user.id}
                                  style={{ width: 160 }}
                                  fontSize={12}
                                />
                                {saving === user.id && (
                                  <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>Saving…</span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Permissions (admin only) */}
                          {user.orgRole === "admin" && myRole === "super_admin" && (
                            <>
                              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                {PERM_GROUPS.map((group) => {
                                  const keys = group.keys.filter((k) => !SUPER_ADMIN_ONLY.has(k));
                                  if (keys.length === 0) return null;
                                  return (
                                  <div key={group.label}>
                                    <label style={labelStyle}>{group.label}</label>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                      {keys.map((key) => {
                                        const alwaysOn = ALWAYS_ON.has(key);
                                        const isOn = perms[key] ?? false;
                                        const toggleDisabled = alwaysOn || savingPerms === user.id;
                                        return (
                                          <div
                                            key={key}
                                            role="button"
                                            tabIndex={toggleDisabled ? -1 : 0}
                                            onClick={() => { if (!toggleDisabled) handlePermToggle(user.id, key, !isOn); }}
                                            onKeyDown={(e) => { if (!toggleDisabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); handlePermToggle(user.id, key, !isOn); } }}
                                            style={{
                                              display: "flex", alignItems: "center", justifyContent: "space-between",
                                              padding: "7px 10px", borderRadius: 8,
                                              cursor: toggleDisabled ? "default" : "pointer",
                                              opacity: alwaysOn ? 0.5 : 1,
                                              transition: "background 150ms ease",
                                            }}
                                            onMouseEnter={(e) => { if (!toggleDisabled) e.currentTarget.style.background = "var(--color-border-light)"; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                                          >
                                            <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-secondary)", lineHeight: 1.3 }}>
                                              {PERM_LABELS[key]}
                                            </span>
                                            <div style={{
                                              position: "relative", width: 34, height: 20, borderRadius: 10, flexShrink: 0,
                                              background: isOn ? "var(--color-brand)" : "var(--color-border)",
                                              transition: "background 150ms ease",
                                            }}>
                                              <div style={{
                                                position: "absolute",
                                                top: 2, left: isOn ? 16 : 2,
                                                width: 16, height: 16, borderRadius: "50%",
                                                background: "#fff",
                                                boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                                                transition: "left 150ms ease",
                                              }} />
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  );
                                })}
                              </div>

                              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 14, borderTop: "1px solid var(--color-border-light)" }}>
                                <button
                                  onClick={() => {
                                    if (hasUnsavedChanges) {
                                      setEditingPerms((prev) => ({ ...prev, [user.id]: { ...savedPerms } }));
                                    } else {
                                      setExpandedUserId(null);
                                    }
                                  }}
                                  disabled={savingPerms === user.id}
                                  className="dg-btn dg-btn-secondary"
                                  style={{ padding: "7px 14px" }}
                                >
                                  {hasUnsavedChanges ? "Undo" : "Cancel"}
                                </button>
                                <button
                                  onClick={() => handlePermsSave(user.id)}
                                  disabled={savingPerms === user.id || !hasUnsavedChanges}
                                  className="dg-btn dg-btn-primary"
                                  style={{ padding: "7px 14px" }}
                                >
                                  {savingPerms === user.id ? "Saving…" : "Save"}
                                </button>
                              </div>
                            </>
                          )}

                          {/* Info for super_admin users */}
                          {isSuperAdminUser && (
                            <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: 0 }}>
                              Super Admins have full access to all organization features.
                            </p>
                          )}

                          {/* Info for regular users */}
                          {user.orgRole === "user" && myRole === "super_admin" && (
                            <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: 0 }}>
                              Users have read-only access. Promote to Admin to configure permissions.
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Role change confirmation */}
      {/* ── Pending Invitations ─────────────────────────────────────── */}
      {(() => {
        const now = new Date().toISOString();
        const pending = invitations.filter((inv) => !inv.acceptedAt && !inv.revokedAt);
        const pendingCount = pending.length;
        if (pendingCount === 0 && !showInvitations) return null;
        return (
          <div style={{ marginTop: 24 }}>
            <button
              onClick={() => setShowInvitations((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: 0, background: "none",
                border: "none", cursor: "pointer", fontSize: "var(--dg-fs-body)", fontWeight: 600,
                color: "var(--color-text-primary)",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showInvitations ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Pending Invitations ({pendingCount})
            </button>
            {showInvitations && (
              <div style={{ marginTop: 12, overflowX: "auto" }}>
                {pending.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-body-sm)" }}>No pending invitations.</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--dg-fs-body-sm)" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--color-text-muted)", fontSize: "var(--dg-fs-footnote)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</th>
                        <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--color-text-muted)", fontSize: "var(--dg-fs-footnote)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Role</th>
                        <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--color-text-muted)", fontSize: "var(--dg-fs-footnote)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Expires</th>
                        <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--color-text-muted)", fontSize: "var(--dg-fs-footnote)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>
                        <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600, color: "var(--color-text-muted)", fontSize: "var(--dg-fs-footnote)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((inv) => {
                        const isExpired = inv.expiresAt < now;
                        return (
                          <tr key={inv.id} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                            <td style={{ padding: "8px 12px" }}>{inv.email}</td>
                            <td style={{ padding: "8px 12px" }}>
                              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: "var(--dg-fs-footnote)", fontWeight: 600, background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                                {inv.roleToAssign === "admin" ? "Admin" : "User"}
                              </span>
                            </td>
                            <td style={{ padding: "8px 12px", color: "var(--color-text-muted)" }}>
                              {new Date(inv.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              <span style={{
                                padding: "2px 8px", borderRadius: 4, fontSize: "var(--dg-fs-footnote)", fontWeight: 600,
                                background: isExpired ? "var(--color-danger-bg)" : "var(--color-warning-bg)",
                                color: isExpired ? "var(--color-danger-dark)" : "var(--color-warning-text)",
                              }}>
                                {isExpired ? "Expired" : "Pending"}
                              </span>
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <button
                                  disabled={invitationAction === inv.id}
                                  onClick={async () => {
                                    setInvitationAction(inv.id);
                                    try {
                                      await resendInvitation(inv.id, orgId);
                                      const refreshed = await fetchInvitations(orgId);
                                      setInvitations(refreshed);
                                      toast.success("Invitation resent");
                                    } catch { toast.error("Failed to resend"); }
                                    finally { setInvitationAction(null); }
                                  }}
                                  style={{
                                    padding: "4px 10px", fontSize: "var(--dg-fs-footnote)", fontWeight: 600, borderRadius: 6,
                                    border: "1px solid var(--color-primary)", background: "transparent",
                                    color: "var(--color-primary)", cursor: invitationAction === inv.id ? "wait" : "pointer",
                                  }}
                                >
                                  Resend
                                </button>
                                {!isExpired && (
                                  <button
                                    disabled={invitationAction === inv.id}
                                    onClick={async () => {
                                      setInvitationAction(inv.id);
                                      try {
                                        await revokeInvitation(inv.id, orgId);
                                        const refreshed = await fetchInvitations(orgId);
                                        setInvitations(refreshed);
                                        toast.success("Invitation revoked");
                                      } catch { toast.error("Failed to revoke"); }
                                      finally { setInvitationAction(null); }
                                    }}
                                    style={{
                                      padding: "4px 10px", fontSize: "var(--dg-fs-footnote)", fontWeight: 600, borderRadius: 6,
                                      border: "1px solid var(--color-danger-border)", background: "transparent",
                                      color: "var(--color-danger-dark)", cursor: invitationAction === inv.id ? "wait" : "pointer",
                                    }}
                                  >
                                    Revoke
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {roleChangeConfirm && (
        <ConfirmDialog
          title="Change Role"
          message={roleChangeMessage}
          confirmLabel="Confirm"
          variant={roleChangeVariant}
          isLoading={saving === roleChangeConfirm.userId}
          onConfirm={confirmRoleChange}
          onCancel={() => setRoleChangeConfirm(null)}
        />
      )}

    </div>
  );
}
