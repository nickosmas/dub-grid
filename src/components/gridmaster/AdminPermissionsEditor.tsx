"use client";

import { useState } from "react";
import { toast } from "sonner";
import Modal from "@/components/Modal";
import { updateAdminPermissions } from "@/lib/db";
import type { AdminPermissions } from "@/types";
import { ButtonLoading } from "@/components/ButtonSpinner";

// ── View / Edit implication pairs ───────────────────────────────────────────
// Enabling an edit permission auto-enables its paired view permission.
// Disabling a view permission auto-disables its paired edit permission.
const VIEW_EDIT_PAIRS: { view: keyof AdminPermissions; edit: keyof AdminPermissions }[] = [
  { view: "canViewEmployeeDetails", edit: "canManageEmployees" },
  { view: "canViewRecurringShifts", edit: "canManageRecurringShifts" },
  { view: "canViewFocusAreas", edit: "canManageFocusAreas" },
  { view: "canViewShiftCodes", edit: "canManageShiftCodes" },
  { view: "canViewIndicatorTypes", edit: "canManageIndicatorTypes" },
  { view: "canViewOrgLabels", edit: "canManageOrgLabels" },
  { view: "canViewCoverageRequirements", edit: "canManageCoverageRequirements" },
];

interface PermEntry {
  key: keyof AdminPermissions;
  label: string;
  /** "view" entries show an eye icon, "edit" entries show a pencil icon */
  kind: "view" | "edit";
  /** If this is an edit permission, which view permission does it imply? */
  implies?: keyof AdminPermissions;
  /** If this is a view permission, which edit permission requires it? */
  requiredBy?: keyof AdminPermissions;
}

const PERMISSION_GROUPS: { label: string; permissions: PermEntry[] }[] = [
  {
    label: "Schedule",
    permissions: [
      { key: "canEditShifts", label: "Edit Shifts", kind: "edit" },
      { key: "canPublishSchedule", label: "Publish Schedule", kind: "edit" },
      { key: "canApplyRecurringSchedule", label: "Apply Recurring Schedule", kind: "edit" },
      { key: "canApproveShiftRequests", label: "Approve Shift Requests", kind: "edit" },
    ],
  },
  {
    label: "Notes",
    permissions: [
      { key: "canEditNotes", label: "Edit Notes / Indicators", kind: "edit" },
    ],
  },
  {
    label: "Recurring Shifts",
    permissions: [
      { key: "canViewRecurringShifts", label: "View Recurring Shifts", kind: "view", requiredBy: "canManageRecurringShifts" },
      { key: "canManageRecurringShifts", label: "Manage Recurring Shifts", kind: "edit", implies: "canViewRecurringShifts" },
      { key: "canManageShiftSeries", label: "Manage Shift Series", kind: "edit" },
    ],
  },
  {
    label: "Staff",
    permissions: [
      { key: "canViewEmployeeDetails", label: "View Employee Details", kind: "view", requiredBy: "canManageEmployees" },
      { key: "canManageEmployees", label: "Add / Edit / Delete Employees", kind: "edit", implies: "canViewEmployeeDetails" },
    ],
  },
  {
    label: "Configuration",
    permissions: [
      { key: "canViewFocusAreas", label: "View Departments", kind: "view", requiredBy: "canManageFocusAreas" },
      { key: "canManageFocusAreas", label: "Manage Departments", kind: "edit", implies: "canViewFocusAreas" },
      { key: "canViewShiftCodes", label: "View Shift Codes", kind: "view", requiredBy: "canManageShiftCodes" },
      { key: "canManageShiftCodes", label: "Manage Shift Codes", kind: "edit", implies: "canViewShiftCodes" },
      { key: "canViewIndicatorTypes", label: "View Indicator Types", kind: "view", requiredBy: "canManageIndicatorTypes" },
      { key: "canManageIndicatorTypes", label: "Manage Indicator Types", kind: "edit", implies: "canViewIndicatorTypes" },
      { key: "canViewOrgLabels", label: "View Custom Labels", kind: "view", requiredBy: "canManageOrgLabels" },
      { key: "canManageOrgLabels", label: "Manage Custom Labels", kind: "edit", implies: "canViewOrgLabels" },
      { key: "canViewCoverageRequirements", label: "View Coverage Requirements", kind: "view", requiredBy: "canManageCoverageRequirements" },
      { key: "canManageCoverageRequirements", label: "Manage Coverage Requirements", kind: "edit", implies: "canViewCoverageRequirements" },
    ],
  },
  {
    label: "Dashboard",
    permissions: [
      { key: "canViewDashboardAnalytics", label: "View Dashboard Analytics", kind: "view" },
    ],
  },
];

const DEFAULT_PERMISSIONS: AdminPermissions = {
  canViewSchedule: true,
  canEditShifts: false,
  canPublishSchedule: false,
  canApplyRecurringSchedule: false,
  canEditNotes: false,
  canViewRecurringShifts: false,
  canManageRecurringShifts: false,
  canManageShiftSeries: false,
  canViewStaff: true,
  canViewEmployeeDetails: false,
  canManageEmployees: false,
  canViewFocusAreas: false,
  canManageFocusAreas: false,
  canViewShiftCodes: false,
  canManageShiftCodes: false,
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

// ── Icons ─────────────────────────────────────────────────────────────────────
const EyeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
  </svg>
);

export default function AdminPermissionsEditor({
  userId,
  orgId,
  userName,
  userEmail,
  currentPermissions,
  onClose,
  onSaved,
}: {
  userId: string;
  orgId: string;
  userName: string;
  userEmail?: string;
  currentPermissions: AdminPermissions | null;
  onClose: () => void;
  onSaved: (perms: AdminPermissions) => void;
}) {
  const [perms, setPerms] = useState<AdminPermissions>({
    ...DEFAULT_PERMISSIONS,
    ...(currentPermissions ?? {}),
    canViewSchedule: true,
  });
  const [saving, setSaving] = useState(false);

  function toggle(key: keyof AdminPermissions) {
    setPerms((prev) => {
      const next = { ...prev };
      const newVal = !prev[key];
      (next as Record<string, boolean>)[key] = newVal;

      if (newVal) {
        // Enabling an edit permission → auto-enable its implied view permission
        const pair = VIEW_EDIT_PAIRS.find((p) => p.edit === key);
        if (pair) (next as Record<string, boolean>)[pair.view] = true;
      } else {
        // Disabling a view permission → auto-disable its paired edit permission
        const pair = VIEW_EDIT_PAIRS.find((p) => p.view === key);
        if (pair) (next as Record<string, boolean>)[pair.edit] = false;
      }

      return next;
    });
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
      await updateAdminPermissions(userId, perms, orgId, userEmail);
      toast.success("Permissions updated");
      onSaved(perms);
      onClose();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) ?? "Failed to update permissions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Admin Permissions — ${userName}`} onClose={onClose} style={{ maxWidth: 520 }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)", marginBottom: 16, flexShrink: 0 }}>
          Configure which actions this admin can perform. <em>View Schedule</em> and <em>View Staff</em> are always enabled.
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
                const checked = perms[p.key] === true;
                const isViewImplied = p.kind === "view" && p.requiredBy && perms[p.requiredBy] === true;
                return (
                  <label
                    key={p.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "5px 0",
                      paddingLeft: p.kind === "edit" && p.implies ? 20 : 0,
                      cursor: isViewImplied ? "default" : "pointer",
                      fontSize: "var(--dg-fs-label)",
                      color: isViewImplied ? "var(--color-text-muted)" : "var(--color-text-primary)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isViewImplied}
                      onChange={() => toggle(p.key)}
                      style={{ width: 16, height: 16, cursor: isViewImplied ? "default" : "pointer" }}
                    />
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {p.kind === "view" ? <EyeIcon /> : <PencilIcon />}
                      {p.label}
                    </span>
                    {isViewImplied && (
                      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", fontStyle: "italic" }}>
                        (included with edit)
                      </span>
                    )}
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
            <ButtonLoading loading={saving} spinnerSize={16}>Save Permissions</ButtonLoading>
          </button>
        </div>
      </div>
    </Modal>
  );
}
