"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { AdminPermissions, OrganizationUser, OrganizationRole } from "@/types";
import {
  fetchOrganizationUsers,
  fetchOrganizationInvitations,
  updateOrganizationMembershipGuarded,
  OrganizationAccessConflictError,
  removeOrganizationMembershipGuarded,
  revokeOrganizationInvitationGuarded,
  resendOrganizationInvitationGuarded,
  InvitationAccessConflictError,
} from "@/features/organization/client";
import { toast } from "sonner";
import { useMediaQuery, MOBILE } from "@/hooks";
import ConfirmDialog from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { UserRound } from "lucide-react";
import { queueNotification } from "@/lib/notify";
import { useAuth } from "@/components/AuthProvider";
import CustomSelect from "@/components/CustomSelect";
import { ROLE_BADGE_COLORS } from "@/lib/styles";
import { PERMISSION_MODULES, VIEW_EDIT_PAIRS, MODULE_ICONS } from "@/components/PermissionsEditor";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EDITOR_ACTION_LABELS, getEditorSaveLabel } from "@/components/ui/editor-action-labels";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import ChangeReviewModal from "@/components/review/ChangeReviewModal";
import { buildInvitationRevocationChanges, buildMembershipAccessChanges } from "@/lib/access-management";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { formatClientErrorMessage } from "@/lib/client-facing";

// ── Admin permission metadata ──────────────────────────────────────────────────

const PERM_GROUPS: { label: string; keys: (keyof AdminPermissions)[] }[] = [
  { label: "Schedule", keys: ["canEditShifts", "canPublishSchedule", "canApplyRecurringSchedule", "canApproveShiftRequests"] },
  { label: "Notes", keys: ["canEditNotes"] },
  { label: "Schedule Indicators", keys: ["canEditScheduleIndicators"] },
  { label: "Recurring", keys: ["canViewRecurringShifts", "canManageRecurringShifts", "canManageShiftSeries"] },
  { label: "Staff", keys: ["canViewEmployeeDetails", "canManageEmployees"] },
  { label: "Configuration", keys: ["canViewFocusAreas", "canManageFocusAreas", "canViewScheduleDefinitions", "canManageScheduleDefinitions", "canViewIndicatorTypes", "canManageIndicatorTypes", "canManageOrgSettings", "canViewOrgLabels", "canManageOrgLabels", "canViewCoverageRequirements", "canManageCoverageRequirements"] },
  { label: "Dashboard", keys: ["canViewDashboardAnalytics"] },
];

const SUPER_ADMIN_ONLY = new Set<keyof AdminPermissions>(["canManageOrgSettings"]);

function emptyAdminPerms(): AdminPermissions {
  return {
    canViewSchedule: true,
    canEditShifts: false,
    canPublishSchedule: false,
    canApplyRecurringSchedule: false,
    canEditNotes: false,
    canEditScheduleIndicators: false,
    canViewRecurringShifts: false,
    canManageRecurringShifts: false,
    canManageShiftSeries: false,
    canViewStaff: true,
    canViewEmployeeDetails: false,
    canManageEmployees: false,
    canViewFocusAreas: false,
    canManageFocusAreas: false,
    canViewScheduleDefinitions: false,
    canManageScheduleDefinitions: false,
    canViewIndicatorTypes: false,
    canManageIndicatorTypes: false,
    canManageOrgSettings: false,
    canViewOrgLabels: false,
    canManageOrgLabels: false,
    canViewCoverageRequirements: false,
    canManageCoverageRequirements: false,
    canApproveShiftRequests: false,
    canViewDashboardAnalytics: false,
  };
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "User",
};

const ROLE_ORDER: Record<string, number> = { super_admin: 0, admin: 1, user: 2 };

const AVATAR_COLORS: Record<string, string> = {
  super_admin: "#92400E",
  admin: "#1D4ED8",
  user: "#475569",
};

type SortKey = "name" | "role" | "lastLogin";

// ── Icons ─────────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={active ? "text-foreground" : "text-muted-foreground/40"}>
      <path d="m7 15 5 5 5-5" opacity={!active || dir === "desc" ? 1 : 0.3} />
      <path d="m7 9 5-5 5 5" opacity={!active || dir === "asc" ? 1 : 0.3} />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UserManagementSettings({ orgId, isSuperAdmin }: { orgId: string; isSuperAdmin: boolean; departments?: import("@/types").Department[] }) {
  const { user: currentUser } = useAuth();
  const isMobile = useMediaQuery(MOBILE);
  const myRole = isSuperAdmin ? "super_admin" : "user";

  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: queryKeys.org.users(orgId),
    queryFn: () => fetchOrganizationUsers(orgId),
  });
  const invitationsQuery = useQuery({
    queryKey: queryKeys.org.invitations(orgId),
    queryFn: () => fetchOrganizationInvitations(orgId),
  });

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const invitations = useMemo(
    () => invitationsQuery.data ?? [],
    [invitationsQuery.data],
  );
  const loading = usersQuery.isPending;
  const [mutationError, setMutationError] = useState<string | null>(null);
  const error = mutationError ?? (
    usersQuery.isError
      ? formatClientErrorMessage(usersQuery.error, "Failed to load users")
      : null
  );
  const setError = setMutationError;

  const setUsers = useCallback(
    (
      updater:
        | OrganizationUser[]
        | ((prev: OrganizationUser[]) => OrganizationUser[]),
    ) => {
      queryClient.setQueryData<OrganizationUser[]>(
        queryKeys.org.users(orgId),
        (prev) => {
          const current = prev ?? [];
          return typeof updater === "function"
            ? (updater as (p: OrganizationUser[]) => OrganizationUser[])(current)
            : updater;
        },
      );
    },
    [orgId, queryClient],
  );
  const setInvitations = useCallback(
    (
      updater:
        | import("@/types").Invitation[]
        | ((
            prev: import("@/types").Invitation[],
          ) => import("@/types").Invitation[]),
    ) => {
      queryClient.setQueryData<import("@/types").Invitation[]>(
        queryKeys.org.invitations(orgId),
        (prev) => {
          const current = prev ?? [];
          return typeof updater === "function"
            ? (
                updater as (
                  p: import("@/types").Invitation[],
                ) => import("@/types").Invitation[]
              )(current)
            : updater;
        },
      );
    },
    [orgId, queryClient],
  );

  // UI state
  const [activeTab, setActiveTab] = useState("active");
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "role", dir: "asc" });

  // Role change
  const [saving, setSaving] = useState<string | null>(null);
  const [roleChangeConfirm, setRoleChangeConfirm] = useState<{
    userId: string; userName: string; from: OrganizationRole; to: OrganizationRole;
  } | null>(null);

  // Permissions
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [editingPerms, setEditingPerms] = useState<Record<string, AdminPermissions>>({});
  const [savingPerms, setSavingPerms] = useState<string | null>(null);
  const pendingPermissionsExitRef = useRef<string | null>(null);

  // Revoke access
  const [revokeConfirm, setRevokeConfirm] = useState<{ userId: string; userName: string } | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Invitation actions
  const [invitationAction, setInvitationAction] = useState<string | null>(null);
  const [permissionsReview, setPermissionsReview] = useState<{
    userId: string;
    changes: ReturnType<typeof buildMembershipAccessChanges>;
  } | null>(null);
  const [invitationRevokeConfirm, setInvitationRevokeConfirm] = useState<import("@/types").Invitation | null>(null);

  // Data is fetched via `usersQuery` / `invitationsQuery` above and kept fresh
  // by realtime invalidation on the `organization_memberships` and
  // `invitations` tables.

  // ── Derived data ─────────────────────────────────────────────────────────────

  const userCount = users.filter((u) => u.orgRole === "user").length;
  const adminCount = users.filter((u) => u.orgRole === "admin").length;
  const superAdminCount = users.filter((u) => u.orgRole === "super_admin").length;

  const pendingInvitations = invitations.filter((inv) => !inv.acceptedAt && !inv.revokedAt);
  const deniedInvitations = invitations.filter((inv) => inv.revokedAt !== null);

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ").toLowerCase();
    const email = (u.email ?? "").toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const aIsYou = !!(currentUser && a.id === currentUser.id);
    const bIsYou = !!(currentUser && b.id === currentUser.id);
    if (aIsYou !== bIsYou) return aIsYou ? -1 : 1;

    const { key, dir } = sortConfig;
    const mul = dir === "asc" ? 1 : -1;

    if (key === "role") {
      const ra = ROLE_ORDER[a.orgRole] ?? 3;
      const rb = ROLE_ORDER[b.orgRole] ?? 3;
      if (ra !== rb) return (ra - rb) * mul;
    }
    if (key === "lastLogin") {
      const da = a.lastSignInAt ? new Date(a.lastSignInAt).getTime() : 0;
      const db = b.lastSignInAt ? new Date(b.lastSignInAt).getTime() : 0;
      if (da !== db) return (da - db) * mul;
    }
    const nameA = [a.firstName, a.lastName].filter(Boolean).join(" ") || a.email || "";
    const nameB = [b.firstName, b.lastName].filter(Boolean).join(" ") || b.email || "";
    return key === "name" ? nameA.localeCompare(nameB) * mul : nameA.localeCompare(nameB);
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  const replaceUser = (updatedUser: OrganizationUser) => {
    setUsers((prev) => prev.map((user) => (
      user.id === updatedUser.id ? updatedUser : user
    )));
  };

  const replaceInvitation = (updatedInvitation: import("@/types").Invitation) => {
    setInvitations((prev) => prev.map((invitation) => (
      invitation.id === updatedInvitation.id ? updatedInvitation : invitation
    )));
  };

  const permissionKeys = useMemo(
    () => PERM_GROUPS.flatMap((group) => group.keys),
    [],
  );

  const expandedUser = useMemo(
    () => users.find((user) => user.id === expandedUserId) ?? null,
    [expandedUserId, users],
  );

  const expandedSavedPerms = useMemo(
    () => (
      expandedUser
        ? { ...emptyAdminPerms(), ...(expandedUser.adminPermissions ?? {}) }
        : null
    ),
    [expandedUser],
  );

  const hasExpandedUnsavedChanges = useMemo(() => {
    if (!expandedUserId || !expandedSavedPerms || editingPerms[expandedUserId] == null) return false;
    return permissionKeys.some((key) => editingPerms[expandedUserId][key] !== expandedSavedPerms[key]);
  }, [editingPerms, expandedSavedPerms, expandedUserId, permissionKeys]);

  const primePermissionsDraft = useCallback((user: OrganizationUser) => {
    setEditingPerms((prev) => ({
      ...prev,
      [user.id]: { ...emptyAdminPerms(), ...(user.adminPermissions ?? {}) },
    }));
  }, []);

  const discardExpandedPermissionsDraft = useCallback((userId: string) => {
    const user = users.find((candidate) => candidate.id === userId);
    if (!user) return;
    primePermissionsDraft(user);
  }, [primePermissionsDraft, users]);

  const completePermissionsExit = useCallback((nextUserId: string | null) => {
    if (expandedUserId) {
      discardExpandedPermissionsDraft(expandedUserId);
    }

    if (!nextUserId) {
      setExpandedUserId(null);
      return;
    }

    const nextUser = users.find((user) => user.id === nextUserId);
    if (!nextUser) {
      setExpandedUserId(null);
      return;
    }

    setExpandedUserId(nextUser.id);
    primePermissionsDraft(nextUser);
  }, [discardExpandedPermissionsDraft, expandedUserId, primePermissionsDraft, users]);

  const { requestClose: requestPermissionsExit, unsavedChangesDialog: permissionsUnsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges: hasExpandedUnsavedChanges,
    onDiscard: () => {
      const nextUserId = pendingPermissionsExitRef.current;
      pendingPermissionsExitRef.current = null;
      completePermissionsExit(nextUserId);
    },
  });

  const attemptPermissionsExit = useCallback((nextUserId: string | null) => {
    pendingPermissionsExitRef.current = nextUserId;
    if (requestPermissionsExit()) {
      pendingPermissionsExitRef.current = null;
      completePermissionsExit(nextUserId);
    }
  }, [completePermissionsExit, requestPermissionsExit]);

  const handleRoleChange = async (userId: string, newRole: OrganizationRole) => {
    setSaving(userId);
    setError(null);
    try {
      const target = users.find((u) => u.id === userId);
      if (!target?.updatedAt) {
        throw new Error("User access data is out of date. Refresh and try again.");
      }
      const oldRole = target?.orgRole ?? "user";
      const updatedUser = await updateOrganizationMembershipGuarded({
        orgId,
        userId,
        expectedUpdatedAt: target.updatedAt,
        orgRole: newRole,
        adminPermissions: newRole === "admin"
          ? target.adminPermissions
          : null,
      });
      replaceUser(updatedUser);
      toast.success("Role updated");
      queueNotification({ action: "role_changed", orgId, targetUserId: userId, fromRole: oldRole, toRole: newRole });
      // Auto-expand permissions panel when promoting to admin
      if (newRole === "admin") {
        setExpandedUserId(userId);
        setEditingPerms((prev) => ({
          ...prev,
          [userId]: { ...emptyAdminPerms(), ...(updatedUser.adminPermissions ?? {}) },
        }));
      } else if (expandedUserId === userId) {
        setExpandedUserId(null);
      }
    } catch (e) {
      if (e instanceof OrganizationAccessConflictError) {
        replaceUser(e.latestUser);
        setRoleChangeConfirm(null);
        toast.error("User access changed elsewhere. Review the latest values and try again.");
        return;
      }
      toast.error("Failed to change role");
      setError(formatClientErrorMessage(e, "Failed to change role"));
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
    void handleRoleChange(roleChangeConfirm.userId, roleChangeConfirm.to);
    setRoleChangeConfirm(null);
  };

  const handleRevokeAccess = async () => {
    if (!revokeConfirm) return;
    setRevoking(true);
    try {
      const target = users.find((user) => user.id === revokeConfirm.userId);
      if (!target?.updatedAt) {
        throw new Error("User access data is out of date. Refresh and try again.");
      }
      await removeOrganizationMembershipGuarded({
        orgId,
        userId: revokeConfirm.userId,
        expectedUpdatedAt: target.updatedAt,
      });
      setUsers((prev) => prev.filter((u) => u.id !== revokeConfirm.userId));
      toast.success("Access revoked");
    } catch (e) {
      if (e instanceof OrganizationAccessConflictError) {
        replaceUser(e.latestUser);
        toast.error("User access changed elsewhere. Review the latest values and try again.");
        return;
      }
      toast.error(formatClientErrorMessage(e, "Failed to revoke access"));
    } finally {
      setRevoking(false);
      setRevokeConfirm(null);
    }
  };

  const openPermissions = (user: OrganizationUser) => {
    if (expandedUserId === user.id) {
      attemptPermissionsExit(null);
      return;
    }
    if (expandedUserId) {
      attemptPermissionsExit(user.id);
      return;
    }
    completePermissionsExit(user.id);
  };

  const handlePermToggle = (userId: string, key: keyof AdminPermissions, value: boolean) => {
    setEditingPerms((prev) => ({ ...prev, [userId]: { ...prev[userId], [key]: value } }));
  };

  const handlePermsSave = async (userId: string) => {
    setSavingPerms(userId);
    setError(null);
    try {
      const target = users.find((user) => user.id === userId);
      if (!target?.updatedAt) {
        throw new Error("User access data is out of date. Refresh and try again.");
      }
      const updatedUser = await updateOrganizationMembershipGuarded({
        orgId,
        userId,
        expectedUpdatedAt: target.updatedAt,
        adminPermissions: editingPerms[userId],
      });
      replaceUser(updatedUser);
      setPermissionsReview(null);
      toast.success("Permissions saved");
    } catch (e) {
      if (e instanceof OrganizationAccessConflictError) {
        replaceUser(e.latestUser);
        setEditingPerms((prev) => ({
          ...prev,
          [userId]: { ...emptyAdminPerms(), ...(e.latestUser.adminPermissions ?? {}) },
        }));
        setPermissionsReview(null);
        toast.error("Permissions changed elsewhere. Review the latest values and try again.");
        return;
      }
      toast.error("Failed to save permissions");
      setError(formatClientErrorMessage(e, "Failed to save permissions"));
    } finally {
      setSavingPerms(null);
    }
  };

  const requestPermsSave = (userId: string) => {
    const target = users.find((user) => user.id === userId);
    if (!target) return;
    const nextPermissions = editingPerms[userId];
    const changes = buildMembershipAccessChanges(target, {
      orgRole: target.orgRole,
      adminPermissions: nextPermissions,
    });
    if (changes.length === 0) return;
    setPermissionsReview({ userId, changes });
  };

  const handleInvitationRevoke = async () => {
    if (!invitationRevokeConfirm?.updatedAt) return;
    setInvitationAction(invitationRevokeConfirm.id);
    try {
      const revokedInvitation = await revokeOrganizationInvitationGuarded({
        orgId,
        invitationId: invitationRevokeConfirm.id,
        expectedUpdatedAt: invitationRevokeConfirm.updatedAt,
      });
      replaceInvitation(revokedInvitation);
      toast.success("Invitation revoked");
    } catch (err) {
      if (err instanceof InvitationAccessConflictError) {
        replaceInvitation(err.latestInvitation);
        toast.error("Invitation changed elsewhere. Review the latest values and try again.");
      } else {
        toast.error("Failed to revoke");
      }
    } finally {
      setInvitationAction(null);
      setInvitationRevokeConfirm(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  };

  const formatDateShort = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // ── Confirm dialog messages ──────────────────────────────────────────────────

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

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const getDisplayName = (user: OrganizationUser) =>
    [user.firstName, user.lastName].filter(Boolean).join(" ") || "—";

  const getInitial = (name: string) =>
    (name !== "—" ? name : "?")[0].toUpperCase();

  /** Render a role badge using the design-system color map */
  function RoleBadge({ role, icon }: { role: string; icon?: boolean }) {
    const colors = ROLE_BADGE_COLORS[role] ?? ROLE_BADGE_COLORS.user;
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap border"
        style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
      >
        {icon && role === "super_admin" && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 -ml-0.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        )}
        {ROLE_LABELS[role] ?? role}
      </span>
    );
  }

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Separator />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[88px] rounded-[var(--dg-radius-md)]" />)}
        </div>
        <Skeleton className="h-10 w-full rounded-[var(--dg-radius-sm)]" />
        <Skeleton className="h-8 w-80" />
        <div className="rounded-[var(--dg-radius-md)] border border-border overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-b-0">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Error banner */}
      {error && (
        <div className="rounded-[var(--dg-radius-md)] border px-4 py-3 text-[13px]" style={{ background: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)", color: "var(--color-danger-text)" }}>
          {error}
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">Users & Access</h2>
        <p className="text-[14px] text-[var(--color-text-muted)] mt-1">Manage staff accounts, roles, and permissions.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Users */}
        <Card size="sm" className="border-[var(--color-border-light)]">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">Users</p>
              <p className="text-2xl font-bold tracking-tight mt-0.5">{userCount}</p>
            </div>
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-bg-secondary)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-subtle)]">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
            </div>
          </CardContent>
        </Card>

        {/* Admins */}
        <Card size="sm" className="border-[var(--color-brand-border)]">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">Admins</p>
              <p className="text-2xl font-bold tracking-tight mt-0.5">{adminCount}</p>
            </div>
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-brand-bg)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-brand)]">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
          </CardContent>
        </Card>

        {/* Super Admins */}
        <Card size="sm" className="border-[#FDE68A]">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#92400E]">Super Admins</p>
              <p className="text-2xl font-bold tracking-tight mt-0.5">{superAdminCount}</p>
            </div>
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#FEF3C7]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="absolute top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-text-faint)]" style={{ left: 12 }}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="dg-input w-full"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          style={{ height: "var(--dg-toolbar-h)", paddingLeft: 36 }}
        />
      </div>

      {/* Tabs */}
      {(() => {
        const tabs: { key: string; label: string; count: number }[] = [
          { key: "active", label: "Active Users", count: sortedUsers.length },
          { key: "pending", label: "Pending Requests", count: pendingInvitations.length },
          { key: "revoked", label: "Revoked Users", count: deniedInvitations.length },
        ];
        return (
          <div className="dg-span-tabs dg-span-tabs--light" style={{ flex: "0 1 auto" }}>
            {tabs.map((tab, i) => {
              const active = activeTab === tab.key;
              const prevActive = i > 0 && activeTab === tabs[i - 1].key;
              const showDivider = i > 0 && !active && !prevActive;
              return (
                <span key={tab.key} style={{ display: "contents" }}>
                  {i > 0 && (
                    <div style={{ width: 1, height: 16, background: showDivider ? "var(--color-border)" : "transparent", flexShrink: 0, alignSelf: "center" }} />
                  )}
                  <button
                    onClick={() => setActiveTab(tab.key)}
                    className={`dg-span-tab${active ? " active" : ""}`}
                  >
                    {tab.label}
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      minWidth: 18, height: 18, borderRadius: "50%", padding: "0 4px",
                      fontSize: "var(--dg-fs-micro)", fontWeight: 700, lineHeight: 1,
                      background: active ? "rgba(255,255,255,0.25)" : "var(--color-border-light)",
                      color: active ? "inherit" : "var(--color-text-muted)",
                      marginLeft: 3,
                    }}>{tab.count}</span>
                  </button>
                </span>
              );
            })}
          </div>
        );
      })()}

      {/* ── Active Users Tab ──────────────────────────────────────────────── */}
      {activeTab === "active" && (
          <div className="rounded-[var(--dg-radius-md)] border border-[var(--color-border-light)] overflow-hidden bg-[var(--color-surface)]">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-[var(--color-bg)]">
                  <TableHead
                    className="pl-6 text-[11px] tracking-wider uppercase text-[var(--color-text-subtle)] font-semibold cursor-pointer select-none"
                    onClick={() => handleSort("name")}
                  >
                    <span className="inline-flex items-center gap-1">
                      User <SortIcon active={sortConfig.key === "name"} dir={sortConfig.dir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-[11px] tracking-wider uppercase text-[var(--color-text-subtle)] font-semibold cursor-pointer select-none"
                    onClick={() => handleSort("role")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Role <SortIcon active={sortConfig.key === "role"} dir={sortConfig.dir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="hidden md:table-cell text-[11px] tracking-wider uppercase text-[var(--color-text-subtle)] font-semibold cursor-pointer select-none"
                    onClick={() => handleSort("lastLogin")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Last Login <SortIcon active={sortConfig.key === "lastLogin"} dir={sortConfig.dir} />
                    </span>
                  </TableHead>
                  <TableHead className="text-right pr-6 text-[11px] tracking-wider uppercase text-[var(--color-text-subtle)] font-semibold"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUsers.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="p-0">
                      <EmptyState
                        size="compact"
                        icon={<UserRound size={22} />}
                        title={search ? "No users match your search" : "No users found"}
                        style={{ border: "none", borderRadius: 0, background: "transparent" }}
                      />
                    </TableCell>
                  </TableRow>
                )}

                {sortedUsers.map((user) => {
                  const displayName = getDisplayName(user);
                  const initial = getInitial(displayName);
                  const isYou = !!(currentUser && user.id === currentUser.id);
                  const isSuperAdminUser = user.orgRole === "super_admin";
                  const isExpanded = expandedUserId === user.id;
                  const canEditRole = isSuperAdmin && !isSuperAdminUser && !isYou;
                  const avatarColor = AVATAR_COLORS[user.orgRole] ?? AVATAR_COLORS.user;

                  const savedPerms = { ...emptyAdminPerms(), ...(user.adminPermissions ?? {}) };
                  const perms = editingPerms[user.id] ?? savedPerms;
                  const hasUnsavedChanges = isExpanded && editingPerms[user.id] != null &&
                    permissionKeys.some((key) => editingPerms[user.id][key] !== savedPerms[key]);

                  const lastLogin = formatDate(user.lastSignInAt);

                  return (
                    <React.Fragment key={user.id}>
                      <TableRow
                        className={`transition-colors ${isExpanded ? "border-b-0 bg-[var(--color-bg)]" : "hover:bg-[var(--color-bg)]"} ${user.orgRole === "admin" && isSuperAdmin ? "cursor-pointer" : ""}`}
                        onClick={() => { if (user.orgRole === "admin" && isSuperAdmin) openPermissions(user); }}
                      >
                        {/* User */}
                        <TableCell className="pl-6 py-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar>
                              <AvatarFallback className="text-[11px] font-bold text-white" style={{ background: avatarColor }}>
                                {initial}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-[14px] font-medium text-[var(--color-text-primary)] truncate">
                                {displayName}
                                {isYou && (
                                  <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-[var(--color-brand-bg)] text-[var(--color-brand)] shrink-0">You</span>
                                )}
                              </div>
                              <div className="text-[12px] text-[var(--color-text-muted)] truncate mt-0.5">
                                {user.email ?? "—"}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        {/* Role */}
                        <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                          {canEditRole ? (
                            <div className="flex items-center gap-2">
                              <CustomSelect
                                value={user.orgRole}
                                options={[
                                  { value: "user", label: "User" },
                                  { value: "admin", label: "Admin" },
                                  { value: "super_admin", label: "Super Admin" },
                                ]}
                                onChange={(v) => requestRoleChange(user, v as OrganizationRole)}
                                disabled={saving === user.id}
                                style={{ width: 140 }}
                                fontSize={12}
                              />
                              {saving === user.id && (
                                <span className="text-[12px] text-[var(--color-text-muted)] animate-pulse">Saving...</span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <RoleBadge role={user.orgRole} icon={isSuperAdminUser} />
                            </div>
                          )}
                        </TableCell>

                        {/* Last Login */}
                        <TableCell className="hidden md:table-cell py-4">
                          <span className="text-[13px] text-[var(--color-text-muted)]">
                            {lastLogin ?? <span className="italic text-[var(--color-text-faint)]">Never</span>}
                          </span>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="pr-6 py-4">
                          <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                            {user.orgRole === "admin" && isSuperAdmin && (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-[var(--color-text-faint)] transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            )}
                            {!isYou && isSuperAdmin && (
                              <button
                                onClick={() => {
                                  const name = getDisplayName(user) !== "—" ? getDisplayName(user) : user.email ?? "User";
                                  setRevokeConfirm({ userId: user.id, userName: name });
                                }}
                                className="dg-btn dg-btn-danger dg-btn-sm"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="15" y1="9" x2="9" y2="15" />
                                  <line x1="9" y1="9" x2="15" y2="15" />
                                </svg>
                                {!isMobile && "Revoke"}
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded permissions panel (admin only) */}
                      {isExpanded && user.orgRole === "admin" && myRole === "super_admin" && (
                        <TableRow className="hover:bg-transparent border-0">
                          <TableCell colSpan={4} className="p-0 bg-[var(--color-bg)]">
                            <div className="border-t border-[var(--color-border-light)]">
                              {/* Column headers */}
                              <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 border-b border-[var(--color-border-light)] text-[11px] font-semibold text-[var(--color-text-subtle)] uppercase tracking-wider">
                                <div className="col-span-8">Module & Access Level</div>
                                <div className="col-span-2 text-center">View</div>
                                <div className="col-span-2 text-center">Edit</div>
                              </div>

                              {/* Permission modules */}
                              {(() => {
                                const catLabels: Record<string, string> = { CORE: "Core Operations", ADMINISTRATION: "Administration" };
                                const categories = [...new Set(PERMISSION_MODULES.map((m) => m.category))];
                                return categories.map((cat) => {
                                  const modules = PERMISSION_MODULES.filter((m) => m.category === cat && !m.editKeys.every((k) => SUPER_ADMIN_ONLY.has(k)));
                                  if (modules.length === 0) return null;
                                  return (
                                    <div key={cat} className="pb-1">
                                      <div className="px-6 py-3 bg-[var(--color-bg)]">
                                        <h3 className="text-[13px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">{catLabels[cat] ?? cat}</h3>
                                      </div>
                                      <div className="divide-y divide-[var(--color-border-light)]">
                                        {modules.map((mod) => {
                                          const hasView = mod.viewKeys.length > 0 || mod.alwaysOnView;
                                          const hasEdit = mod.editKeys.length > 0;
                                          const viewOn = mod.alwaysOnView || (mod.viewKeys.length > 0 && mod.viewKeys.every((k) => perms[k] === true));
                                          const editOn = mod.editKeys.length > 0 && mod.editKeys.every((k) => perms[k] === true);
                                          const viewDisabled = mod.alwaysOnView || savingPerms === user.id;
                                          const editDisabled = savingPerms === user.id;
                                          const isActive = viewOn || editOn;
                                          const viewImplied = mod.viewKeys.length > 0 && mod.viewKeys.every((vk) => {
                                            const pair = VIEW_EDIT_PAIRS.find((p) => p.view === vk);
                                            return pair ? perms[pair.edit] === true : false;
                                          });
                                          return (
                                            <div key={mod.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 hover:bg-[var(--color-bg)] transition-colors items-center">
                                              <div className="col-span-1 md:col-span-8 flex items-start">
                                                <div className={`p-2 rounded-[var(--dg-radius-sm)] mr-4 shrink-0 ${isActive ? "bg-[var(--color-brand-bg)] text-[var(--color-brand)]" : "bg-[var(--color-bg-secondary)] text-[var(--color-text-faint)]"}`}>
                                                  {(() => { const ModIcon = MODULE_ICONS[mod.icon as keyof typeof MODULE_ICONS]; return ModIcon ? <ModIcon /> : null; })()}
                                                </div>
                                                <div>
                                                  <h4 className="font-medium text-[14px] text-[var(--color-text-primary)]">{mod.title}</h4>
                                                  <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5 pr-4 leading-relaxed">{mod.description}</p>
                                                </div>
                                              </div>
                                              <div className="col-span-1 md:col-span-4 grid grid-cols-2 gap-4 mt-3 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-[var(--color-border-light)]">
                                                <div className="flex flex-col items-center justify-center gap-1.5">
                                                  <span className="md:hidden text-[11px] font-medium text-[var(--color-text-subtle)] uppercase">View</span>
                                                  {hasView ? (
                                                    <button
                                                      type="button" role="switch" aria-checked={viewOn}
                                                      disabled={viewDisabled || viewImplied}
                                                      onClick={() => {
                                                        if (!viewDisabled && !viewImplied) {
                                                          const allOn = mod.viewKeys.every((k) => perms[k]);
                                                          for (const k of mod.viewKeys) handlePermToggle(user.id, k, !allOn);
                                                          if (allOn) {
                                                            for (const vk of mod.viewKeys) {
                                                              const pair = VIEW_EDIT_PAIRS.find((p) => p.view === vk);
                                                              if (pair) handlePermToggle(user.id, pair.edit, false);
                                                            }
                                                          }
                                                        }
                                                      }}
                                                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${(viewDisabled || viewImplied) ? "opacity-40 cursor-default" : "cursor-pointer"}`}
                                                      style={{ background: viewOn ? "var(--color-brand)" : "var(--color-border)" }}
                                                    >
                                                      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${viewOn ? "translate-x-5" : "translate-x-0"}`} />
                                                    </button>
                                                  ) : (
                                                    <span className="text-[13px] text-[var(--color-text-faint)]">—</span>
                                                  )}
                                                </div>
                                                <div className="flex flex-col items-center justify-center gap-1.5">
                                                  <span className="md:hidden text-[11px] font-medium text-[var(--color-text-subtle)] uppercase">Edit</span>
                                                  {hasEdit ? (
                                                    <button
                                                      type="button" role="switch" aria-checked={editOn}
                                                      disabled={editDisabled}
                                                      onClick={() => {
                                                        if (!editDisabled) {
                                                          const allOn = mod.editKeys.every((k) => perms[k]);
                                                          for (const k of mod.editKeys) handlePermToggle(user.id, k, !allOn);
                                                          if (!allOn) {
                                                            for (const ek of mod.editKeys) {
                                                              const pair = VIEW_EDIT_PAIRS.find((p) => p.edit === ek);
                                                              if (pair) handlePermToggle(user.id, pair.view, true);
                                                            }
                                                          }
                                                        }
                                                      }}
                                                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${editDisabled ? "opacity-40 cursor-default" : "cursor-pointer"}`}
                                                      style={{ background: editOn ? "var(--color-brand)" : "var(--color-border)" }}
                                                    >
                                                      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${editOn ? "translate-x-5" : "translate-x-0"}`} />
                                                    </button>
                                                  ) : (
                                                    <span className="text-[13px] text-[var(--color-text-faint)]">—</span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                });
                              })()}

                              {/* Save / Undo */}
                              <EditorActionRow
                                className="px-6 py-4 border-t border-[var(--color-border-light)] bg-[var(--color-bg)]"
                                secondaryAction={(
                                  <button
                                    onClick={() => {
                                      if (hasUnsavedChanges) {
                                        setEditingPerms((prev) => ({ ...prev, [user.id]: { ...savedPerms } }));
                                      } else {
                                        attemptPermissionsExit(null);
                                      }
                                    }}
                                    disabled={savingPerms === user.id}
                                    className="dg-btn dg-btn-secondary dg-btn-sm"
                                  >
                                    {hasUnsavedChanges ? EDITOR_ACTION_LABELS.discard : EDITOR_ACTION_LABELS.close}
                                  </button>
                                )}
                                primaryAction={(
                                  <button
                                    onClick={() => requestPermsSave(user.id)}
                                    disabled={savingPerms === user.id || !hasUnsavedChanges}
                                    className="dg-btn dg-btn-primary dg-btn-sm"
                                  >
                                    {getEditorSaveLabel(savingPerms === user.id)}
                                  </button>
                                )}
                              />
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
      )}

      {/* ── Pending Requests Tab ──────────────────────────────────────────── */}
      {activeTab === "pending" && (
          <div className="rounded-[var(--dg-radius-md)] border border-[var(--color-border-light)] overflow-hidden bg-[var(--color-surface)]">
            {pendingInvitations.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-2">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-faint)]">
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <p className="text-[13px] text-[var(--color-text-muted)]">No pending invitations</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-[var(--color-bg)]">
                    <TableHead className="pl-4 text-[11px] tracking-wide uppercase text-[var(--color-text-subtle)] font-bold">Email</TableHead>
                    <TableHead className="text-[11px] tracking-wide uppercase text-[var(--color-text-subtle)] font-bold">Role</TableHead>
                    <TableHead className="hidden md:table-cell text-[11px] tracking-wide uppercase text-[var(--color-text-subtle)] font-bold">Expires</TableHead>
                    <TableHead className="hidden md:table-cell text-[11px] tracking-wide uppercase text-[var(--color-text-subtle)] font-bold">Status</TableHead>
                    <TableHead className="text-right pr-4 text-[11px] tracking-wide uppercase text-[var(--color-text-subtle)] font-bold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvitations.map((inv) => {
                    const now = new Date().toISOString();
                    const isExpired = inv.expiresAt < now;
                    return (
                      <TableRow key={inv.id} className="hover:bg-[var(--color-bg)]">
                        <TableCell className="pl-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback className="text-[11px] font-bold">
                                {inv.email[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-[13px] text-[var(--color-text-primary)]">{inv.email}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <RoleBadge role={inv.roleToAssign} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell py-3 text-[12px] text-[var(--color-text-muted)]">
                          {formatDateShort(inv.expiresAt)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell py-3">
                          {isExpired ? (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border" style={{ background: "var(--color-danger-bg)", color: "var(--color-danger-text)", borderColor: "var(--color-danger-border)" }}>
                              Expired
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border" style={{ background: "#FFFBEB", color: "#92400E", borderColor: "#FDE68A" }}>
                              Pending
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="pr-4 py-3">
                          <div className="flex gap-2 justify-end">
                            <button
                              disabled={invitationAction === inv.id}
                              onClick={async () => {
                                if (!inv.updatedAt) {
                                  toast.error("Invitation data is out of date. Refresh and try again.");
                                  return;
                                }
                                setInvitationAction(inv.id);
                                try {
                                  const resent = await resendOrganizationInvitationGuarded({
                                    orgId,
                                    invitationId: inv.id,
                                    expectedUpdatedAt: inv.updatedAt,
                                  });
                                  replaceInvitation(resent.invitation);
                                  toast.success("Invitation resent");
                                } catch (err) {
                                  if (err instanceof InvitationAccessConflictError) {
                                    replaceInvitation(err.latestInvitation);
                                    toast.error("Invitation changed elsewhere. Review the latest values and try again.");
                                  } else {
                                    toast.error("Failed to resend");
                                  }
                                }
                                finally { setInvitationAction(null); }
                              }}
                              className="dg-btn dg-btn-secondary dg-btn-sm"
                            >
                              Resend
                            </button>
                            {!isExpired && (
                              <button
                                disabled={invitationAction === inv.id}
                                onClick={() => setInvitationRevokeConfirm(inv)}
                                className="dg-btn dg-btn-danger dg-btn-sm"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
      )}

      {/* ── Revoked Users Tab ─────────────────────────────────────────────── */}
      {activeTab === "revoked" && (
          <div className="rounded-[var(--dg-radius-md)] border border-[var(--color-border-light)] overflow-hidden bg-[var(--color-surface)]">
            {deniedInvitations.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-2">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-faint)]">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <p className="text-[13px] text-[var(--color-text-muted)]">No revoked users</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-[var(--color-bg)]">
                    <TableHead className="pl-4 text-[11px] tracking-wide uppercase text-[var(--color-text-subtle)] font-bold">Email</TableHead>
                    <TableHead className="text-[11px] tracking-wide uppercase text-[var(--color-text-subtle)] font-bold">Role</TableHead>
                    <TableHead className="hidden md:table-cell text-[11px] tracking-wide uppercase text-[var(--color-text-subtle)] font-bold">Revoked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deniedInvitations.map((inv) => (
                    <TableRow key={inv.id} className="hover:bg-[var(--color-bg)]">
                      <TableCell className="pl-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback className="text-[11px] font-bold">
                              {inv.email[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-[13px] text-[var(--color-text-primary)]">{inv.email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <RoleBadge role={inv.roleToAssign} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell py-3 text-[12px] text-[var(--color-text-muted)]">
                        {formatDateShort(inv.revokedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
      )}

      {/* ── Confirm dialogs ─────────────────────────────────────────────────── */}
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

      {revokeConfirm && (
        <ConfirmDialog
          title="Revoke Access"
          message={`Are you sure you want to revoke "${revokeConfirm.userName}"'s access to this organization? This action can be undone by re-inviting them.`}
          confirmLabel="Revoke Access"
          variant="danger"
          isLoading={revoking}
          onConfirm={handleRevokeAccess}
          onCancel={() => setRevokeConfirm(null)}
        />
      )}

      {permissionsReview ? (
        <ChangeReviewModal
          title="Review Permission Changes"
          description="Review these permission changes before saving. Admin access changes affect what this person can see and do across the organization."
          changes={permissionsReview.changes}
          saving={savingPerms === permissionsReview.userId}
          confirmLabel="Confirm Save"
          warningText="This save updates sensitive admin permissions."
          onCancel={() => {
            if (!savingPerms) setPermissionsReview(null);
          }}
          onConfirm={() => {
            void handlePermsSave(permissionsReview.userId);
          }}
        />
      ) : null}

      {invitationRevokeConfirm ? (
        <ChangeReviewModal
          title="Review Invitation Revocation"
          description="Review this invitation change before saving. Revoking an invitation immediately blocks the recipient from using the current invite link."
          changes={buildInvitationRevocationChanges()}
          saving={invitationAction === invitationRevokeConfirm.id}
          confirmLabel="Revoke Invitation"
          warningText="This change revokes a pending invitation."
          onCancel={() => {
            if (!invitationAction) setInvitationRevokeConfirm(null);
          }}
          onConfirm={() => {
            void handleInvitationRevoke();
          }}
        />
      ) : null}

      {permissionsUnsavedChangesDialog}
    </div>
  );
}
