"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";
import { useDirectory } from "@/hooks/useDirectory";
import { updateAppOnlyUser, updateEmployeeDepartments, updatePendingInvitation, updateAdminPermissions, invalidateOrgDirectory } from "@/lib/db";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { supabase } from "@/lib/supabase";
import type { Department, DirectoryPerson, AdminPermissions } from "@/types";
import PermissionsEditor from "@/components/PermissionsEditor";

interface DepartmentRosterProps {
  department: Department;
  orgId: string;
  canEdit: boolean;
}

export default function DepartmentRoster({ department, orgId, canEdit }: DepartmentRosterProps) {
  const { directory, loading } = useDirectory(orgId);
  const queryClient = useQueryClient();
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [editingPerms, setEditingPerms] = useState<{
    person: DirectoryPerson;
    currentPermissions: AdminPermissions | null;
  } | null>(null);

  const members = useMemo(
    () => directory.filter((p) => p.departmentIds.includes(department.id)),
    [directory, department.id],
  );

  const nonMembers = useMemo(() => {
    if (!showAddPicker) return [];
    const q = search.toLowerCase().trim();
    return directory
      .filter((p) => !p.departmentIds.includes(department.id))
      .filter((p) => {
        if (!q) return true;
        const name = `${p.firstName} ${p.lastName}`.toLowerCase();
        return name.includes(q) || p.email.toLowerCase().includes(q);
      })
      .slice(0, 20);
  }, [directory, department.id, showAddPicker, search]);

  async function invalidate() {
    await invalidateOrgDirectory(orgId);
    queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) });
  }

  async function updatePersonDepts(person: DirectoryPerson, newDeptIds: number[], newAdminIds?: number[]) {
    if (person.source === "employee" && person.employeeId) {
      await updateEmployeeDepartments(person.employeeId, newDeptIds, orgId, newAdminIds);
    } else if (person.source === "pending_invite") {
      const invId = person.personId.replace(/^inv:/, "");
      const data: { departmentIds: number[]; deptAdminIds?: number[] } = { departmentIds: newDeptIds };
      if (newAdminIds !== undefined) data.deptAdminIds = newAdminIds;
      await updatePendingInvitation(invId, orgId, data);
    } else if (person.userId) {
      const data: { departmentIds: number[]; deptAdminIds?: number[] } = { departmentIds: newDeptIds };
      if (newAdminIds !== undefined) data.deptAdminIds = newAdminIds;
      await updateAppOnlyUser(person.userId, orgId, data);
    }
  }

  async function addMember(person: DirectoryPerson, asAdmin: boolean) {
    setUpdating(person.personId);
    try {
      const newDeptIds = [...person.departmentIds, department.id];
      const newAdminIds = asAdmin ? [...person.deptAdminIds, department.id] : undefined;
      await updatePersonDepts(person, newDeptIds, newAdminIds);
      await invalidate();
      toast.success(`Added ${person.firstName} ${person.lastName} as ${asAdmin ? "admin" : "user"}`);
      // If added as admin with app access, open permissions editor immediately
      if (asAdmin && person.userId) {
        const { data } = await supabase
          .from("organization_memberships")
          .select("admin_permissions")
          .eq("user_id", person.userId)
          .eq("org_id", orgId)
          .single();
        setEditingPerms({
          person,
          currentPermissions: (data?.admin_permissions ?? null) as AdminPermissions | null,
        });
      }
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) ?? "Failed to add member");
    } finally {
      setUpdating(null);
    }
  }

  async function removeMember(person: DirectoryPerson) {
    setUpdating(person.personId);
    try {
      await updatePersonDepts(
        person,
        person.departmentIds.filter((id) => id !== department.id),
        person.deptAdminIds.filter((id) => id !== department.id),
      );
      await invalidate();
      toast.success(`Removed ${person.firstName} ${person.lastName}`);
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) ?? "Failed to remove member");
    } finally {
      setUpdating(null);
    }
  }

  async function toggleMemberRole(person: DirectoryPerson) {
    setUpdating(person.personId);
    const isAdmin = person.deptAdminIds.includes(department.id);
    try {
      const newAdminIds = isAdmin
        ? person.deptAdminIds.filter((id) => id !== department.id)
        : [...person.deptAdminIds, department.id];
      await updatePersonDepts(person, person.departmentIds, newAdminIds);
      await invalidate();
      const nowAdmin = !isAdmin;
      toast.success(`${person.firstName} ${person.lastName} is now ${nowAdmin ? "an admin" : "a user"}`);
      // If promoted to admin with app access, open permissions editor
      if (nowAdmin && person.userId) {
        const { data } = await supabase
          .from("organization_memberships")
          .select("admin_permissions")
          .eq("user_id", person.userId)
          .eq("org_id", orgId)
          .single();
        setEditingPerms({
          person,
          currentPermissions: (data?.admin_permissions ?? null) as AdminPermissions | null,
        });
      }
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) ?? "Failed to update role");
    } finally {
      setUpdating(null);
    }
  }

  async function openPermsEditor(person: DirectoryPerson) {
    if (!person.userId) return;
    const { data } = await supabase
      .from("organization_memberships")
      .select("admin_permissions")
      .eq("user_id", person.userId)
      .eq("org_id", orgId)
      .single();
    setEditingPerms({
      person,
      currentPermissions: (data?.admin_permissions ?? null) as AdminPermissions | null,
    });
  }

  const sourceBadge = (source: DirectoryPerson["source"]) => {
    const config =
      source === "employee"
        ? { label: "Employee", bg: "var(--color-success-bg)", color: "var(--color-success-text)" }
        : source === "user_only"
          ? { label: "Management Staff", bg: "var(--color-bg-secondary)", color: "var(--color-text-muted)" }
          : { label: "Invited", bg: "var(--color-warning-bg)", color: "var(--color-warning-text)" };
    return (
      <span
        style={{
          fontSize: "var(--dg-fs-badge)",
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 10,
          background: config.bg,
          color: config.color,
          whiteSpace: "nowrap",
          lineHeight: 1.4,
          letterSpacing: "0.02em",
        }}
      >
        {config.label}
      </span>
    );
  };

  const roleBadge = (person: DirectoryPerson) => {
    const isAdmin = person.deptAdminIds.includes(department.id);
    const badge = (
      <button
        onClick={(e) => { e.preventDefault(); toggleMemberRole(person); }}
        disabled={!canEdit || updating === person.personId}
        style={{
          fontSize: "var(--dg-fs-badge)",
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 10,
          background: isAdmin ? "var(--color-primary-bg, #EBF5FF)" : "var(--color-bg-secondary)",
          color: isAdmin ? "var(--color-primary, #2563EB)" : "var(--color-text-muted)",
          border: "none",
          cursor: canEdit ? "pointer" : "default",
          whiteSpace: "nowrap",
          lineHeight: 1.4,
          letterSpacing: "0.02em",
          transition: "background 0.15s, color 0.15s",
        }}
      >
        {isAdmin ? "Admin" : "User"}
      </button>
    );
    if (!canEdit) return badge;
    return (
      <Hint content={hint(`Switch to ${isAdmin ? "user" : "admin"}`)} side="left">
        {badge}
      </Hint>
    );
  };

  if (loading) {
    return <div style={{ padding: "8px 0", fontSize: "var(--dg-fs-caption)", color: "var(--color-text-faint)" }}>Loading members...</div>;
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "4px 0" }}>
        <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Members ({members.length})
        </span>
        {canEdit && (
          <button
            className="dg-btn dg-btn-ghost"
            onClick={() => { setShowAddPicker(!showAddPicker); setSearch(""); }}
            style={{ fontSize: "var(--dg-fs-caption)", padding: "2px 8px" }}
          >
            {showAddPicker ? "Done" : "+ Add"}
          </button>
        )}
      </div>

      {/* ── Add member picker ─────────────────────────────────────────── */}
      {showAddPicker && (
        <div className="dg-card-enter" style={{ marginBottom: 12, border: "1px solid var(--color-border-light)", borderRadius: 8, padding: 8, background: "var(--color-surface-subtle, #FAFAFA)" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people to add..."
            className="dg-input"
            autoFocus
            style={{ width: "100%", marginBottom: 6, fontSize: "var(--dg-fs-label)" }}
          />
          {nonMembers.length === 0 ? (
            <div style={{ padding: "6px 0", fontSize: "var(--dg-fs-caption)", color: "var(--color-text-faint)" }}>
              {search ? "No matching people found" : "No people available to add"}
            </div>
          ) : (
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {nonMembers.map((p) => (
                <div
                  key={p.personId}
                  className="dg-hover-row"
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 8px", borderBottom: "1px solid var(--color-border-light)", fontSize: "var(--dg-fs-label)" }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.firstName} {p.lastName}
                    {p.email && <span style={{ color: "var(--color-text-faint)", marginLeft: 6, fontSize: "var(--dg-fs-caption)" }}>{p.email}</span>}
                  </span>
                  {sourceBadge(p.source)}
                  <button
                    className="dg-btn dg-btn-ghost"
                    onClick={() => addMember(p, false)}
                    disabled={updating === p.personId}
                    style={{ fontSize: "var(--dg-fs-caption)", padding: "2px 8px" }}
                  >
                    {updating === p.personId ? "..." : "as User"}
                  </button>
                  <button
                    className="dg-btn dg-btn-ghost"
                    onClick={() => addMember(p, true)}
                    disabled={updating === p.personId}
                    style={{ fontSize: "var(--dg-fs-caption)", padding: "2px 8px", color: "var(--color-primary, #2563EB)" }}
                  >
                    {updating === p.personId ? "..." : "as Admin"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Member list ───────────────────────────────────────────────── */}
      {members.length === 0 ? (
        <div style={{ padding: "12px 0", fontSize: "var(--dg-fs-caption)", color: "var(--color-text-faint)", textAlign: "center" }}>
          No members yet
        </div>
      ) : (
        <div>
          {members.map((p) => {
            const isAdmin = p.deptAdminIds.includes(department.id);
            const hasAppAccess = !!p.userId;
            return (
              <div
                key={p.personId}
                className="dg-hover-row"
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderBottom: "1px solid var(--color-border-light)", fontSize: "var(--dg-fs-label)" }}
              >
                <span style={{ flex: 1, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.firstName} {p.lastName}
                </span>
                {roleBadge(p)}
                {/* Configure permissions — any member with app access */}
                {hasAppAccess && canEdit && (
                  <button
                    className="dg-btn dg-btn-ghost"
                    onClick={() => openPermsEditor(p)}
                    style={{ fontSize: "var(--dg-fs-caption)", padding: "2px 8px", flexShrink: 0 }}
                  >
                    Configure
                  </button>
                )}
                {!hasAppAccess && (
                  <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-faint)", fontStyle: "italic", flexShrink: 0 }}>
                    No account
                  </span>
                )}
                {canEdit && (
                  <button
                    className="dg-btn dg-btn-ghost"
                    onClick={() => removeMember(p)}
                    disabled={updating === p.personId}
                    style={{ fontSize: "var(--dg-fs-caption)", padding: "2px 8px", color: "var(--color-text-faint)", flexShrink: 0 }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-danger)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-faint)")}
                  >
                    {updating === p.personId ? "..." : "Remove"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Per-user permissions editor ───────────────────────────────── */}
      {editingPerms && (
        <PermissionsEditor
          title={`Permissions \u2014 ${editingPerms.person.firstName} ${editingPerms.person.lastName}`}
          subtitle={<>Configure what <strong>{editingPerms.person.firstName} {editingPerms.person.lastName}</strong> can do. <em>View Schedule</em> and <em>View Staff</em> are always enabled.</>}
          initialPermissions={editingPerms.currentPermissions}
          showPermissionCounter
          lockedFalse={["canManageOrgSettings"]}
          onSave={async (perms) => {
            await updateAdminPermissions(editingPerms.person.userId!, perms, orgId, editingPerms.person.email || undefined);
            toast.success("Permissions updated");
            await invalidate();
          }}
          onClose={() => setEditingPerms(null)}
        />
      )}
    </div>
  );
}
