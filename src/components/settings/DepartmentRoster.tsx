"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useDirectory } from "@/hooks/useDirectory";
import { updateAppOnlyUser, updateEmployeeDepartments, updatePendingInvitation, invalidateOrgDirectory } from "@/lib/db";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { Department, DirectoryPerson } from "@/types";

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

  async function updatePersonDepts(person: DirectoryPerson, newDeptIds: number[]) {
    if (person.source === "employee" && person.employeeId) {
      await updateEmployeeDepartments(person.employeeId, newDeptIds, orgId);
    } else if (person.source === "pending_invite") {
      // personId is 'inv:<uuid>' — extract the invitation ID
      const invId = person.personId.replace(/^inv:/, "");
      await updatePendingInvitation(invId, orgId, { departmentIds: newDeptIds });
    } else if (person.userId) {
      await updateAppOnlyUser(person.userId, orgId, { departmentIds: newDeptIds });
    }
  }

  async function addMember(person: DirectoryPerson) {
    setUpdating(person.personId);
    try {
      await updatePersonDepts(person, [...person.departmentIds, department.id]);
      await invalidate();
      toast.success(`Added ${person.firstName} ${person.lastName}`);
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) ?? "Failed to add member");
    } finally {
      setUpdating(null);
    }
  }

  async function removeMember(person: DirectoryPerson) {
    setUpdating(person.personId);
    try {
      await updatePersonDepts(person, person.departmentIds.filter((id) => id !== department.id));
      await invalidate();
      toast.success(`Removed ${person.firstName} ${person.lastName}`);
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) ?? "Failed to remove member");
    } finally {
      setUpdating(null);
    }
  }

  const sourceBadge = (source: DirectoryPerson["source"]) => {
    const label = source === "employee" ? "Staff" : source === "user_only" ? "App Only" : "Invited";
    const bg = source === "employee" ? "var(--color-brand-light, #E0E7FF)" : "var(--color-surface-subtle, #F3F4F6)";
    return (
      <span style={{ fontSize: "var(--dg-fs-caption)", padding: "1px 6px", borderRadius: 4, background: bg, color: "var(--color-text-subtle)", whiteSpace: "nowrap" }}>
        {label}
      </span>
    );
  };

  if (loading) {
    return <div style={{ padding: "8px 0", fontSize: "var(--dg-fs-caption)", color: "var(--color-text-faint)" }}>Loading members...</div>;
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
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
        <div style={{ marginBottom: 12, border: "1px solid var(--color-border-light)", borderRadius: 8, padding: 8, background: "var(--color-surface-subtle, #FAFAFA)" }}>
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
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px", borderBottom: "1px solid var(--color-border-light)", fontSize: "var(--dg-fs-label)" }}
                >
                  <span style={{ flex: 1 }}>
                    {p.firstName} {p.lastName}
                    {p.email && <span style={{ color: "var(--color-text-faint)", marginLeft: 6, fontSize: "var(--dg-fs-caption)" }}>{p.email}</span>}
                  </span>
                  {sourceBadge(p.source)}
                  <button
                    className="dg-btn dg-btn-ghost"
                    onClick={() => addMember(p)}
                    disabled={updating === p.personId}
                    style={{ fontSize: "var(--dg-fs-caption)", padding: "2px 8px" }}
                  >
                    {updating === p.personId ? "..." : "Add"}
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
          {members.map((p) => (
            <div
              key={p.personId}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", borderBottom: "1px solid var(--color-border-light)", fontSize: "var(--dg-fs-label)" }}
            >
              <span style={{ flex: 1, fontWeight: 500 }}>
                {p.firstName} {p.lastName}
              </span>
              {p.email && <span style={{ color: "var(--color-text-faint)", fontSize: "var(--dg-fs-caption)" }}>{p.email}</span>}
              {sourceBadge(p.source)}
              {canEdit && (
                <button
                  className="dg-btn dg-btn-ghost"
                  onClick={() => removeMember(p)}
                  disabled={updating === p.personId}
                  style={{ fontSize: "var(--dg-fs-caption)", padding: "2px 8px", color: "var(--color-danger, #EF4444)" }}
                >
                  {updating === p.personId ? "..." : "Remove"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
