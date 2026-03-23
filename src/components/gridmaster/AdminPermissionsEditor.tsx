"use client";

import { useState } from "react";
import { toast } from "sonner";
import Modal from "@/components/Modal";
import { updateAdminPermissions } from "@/lib/db";
import type { AdminPermissions } from "@/types";

const PERMISSION_GROUPS = [
  {
    label: "Schedule",
    permissions: [
      { key: "canEditShifts", label: "Edit Shifts" },
      { key: "canPublishSchedule", label: "Publish Schedule" },
      { key: "canApplyRecurringSchedule", label: "Apply Recurring Schedule" },
      { key: "canApproveShiftRequests", label: "Approve Shift Requests" },
    ],
  },
  {
    label: "Notes",
    permissions: [
      { key: "canEditNotes", label: "Edit Notes" },
    ],
  },
  {
    label: "Recurring Shifts",
    permissions: [
      { key: "canManageRecurringShifts", label: "Manage Recurring Shifts" },
      { key: "canManageShiftSeries", label: "Manage Shift Series" },
    ],
  },
  {
    label: "Staff",
    permissions: [
      { key: "canViewStaff", label: "View Staff" },
      { key: "canManageEmployees", label: "Manage Employees" },
    ],
  },
  {
    label: "Configuration",
    permissions: [
      { key: "canManageFocusAreas", label: "Manage Focus Areas" },
      { key: "canManageShiftCodes", label: "Manage Shift Codes" },
      { key: "canManageIndicatorTypes", label: "Manage Indicator Types" },
      { key: "canManageOrgLabels", label: "Manage Custom Labels" },
      { key: "canManageCoverageRequirements", label: "Manage Coverage Requirements" },
    ],
  },
] as const;

const DEFAULT_PERMISSIONS: AdminPermissions = {
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

export default function AdminPermissionsEditor({
  userId,
  orgId,
  userName,
  currentPermissions,
  onClose,
  onSaved,
}: {
  userId: string;
  orgId: string;
  userName: string;
  currentPermissions: AdminPermissions | null;
  onClose: () => void;
  onSaved: (perms: AdminPermissions) => void;
}) {
  const [perms, setPerms] = useState<AdminPermissions>({
    ...DEFAULT_PERMISSIONS,
    ...(currentPermissions ?? {}),
    // canViewSchedule is always true and not editable
    canViewSchedule: true,
  });
  const [saving, setSaving] = useState(false);

  function toggle(key: string) {
    setPerms((prev) => ({
      ...prev,
      [key]: !prev[key as keyof AdminPermissions],
    }));
  }

  function selectAll() {
    const allTrue = { ...perms };
    for (const group of PERMISSION_GROUPS) {
      for (const p of group.permissions) {
        (allTrue as Record<string, boolean>)[p.key] = true;
      }
    }
    setPerms(allTrue);
  }

  function clearAll() {
    const allFalse = { ...perms };
    for (const group of PERMISSION_GROUPS) {
      for (const p of group.permissions) {
        (allFalse as Record<string, boolean>)[p.key] = false;
      }
    }
    setPerms(allFalse);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateAdminPermissions(userId, perms, orgId);
      toast.success("Permissions updated");
      onSaved(perms);
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update permissions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Admin Permissions — ${userName}`} onClose={onClose} style={{ maxWidth: 520 }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)", marginBottom: 16, flexShrink: 0 }}>
          Configure which actions this admin can perform. <em>View Schedule</em> is always enabled.
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexShrink: 0 }}>
          <button className="dg-btn dg-btn-ghost" onClick={selectAll} style={{ fontSize: "var(--dg-fs-caption)" }}>Select All</button>
          <button className="dg-btn dg-btn-ghost" onClick={clearAll} style={{ fontSize: "var(--dg-fs-caption)" }}>Clear All</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 700, color: "var(--color-text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                {group.label}
              </div>
              {group.permissions.map((p) => {
                const checked = perms[p.key as keyof AdminPermissions] === true;
                return (
                  <label
                    key={p.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 0",
                      cursor: "pointer",
                      fontSize: "var(--dg-fs-label)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.key)}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                    {p.label}
                  </label>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 20, flexShrink: 0, borderTop: "1px solid var(--color-border-light)" }}>
          <button className="dg-btn dg-btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="dg-btn dg-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Permissions"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
