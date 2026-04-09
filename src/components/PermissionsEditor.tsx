"use client";

import { useState } from "react";
import { toast } from "sonner";
import Modal from "@/components/Modal";
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

// ── Section 1: View Access ──────────────────────────────────────────────────
interface ViewPermEntry {
  key: keyof AdminPermissions;
  label: string;
  /** Which management permission, if any, implies this view permission? */
  impliedBy?: keyof AdminPermissions;
}

const VIEW_PERMISSIONS: ViewPermEntry[] = [
  { key: "canViewEmployeeDetails", label: "Employee Details", impliedBy: "canManageEmployees" },
  { key: "canViewRecurringShifts", label: "Recurring Shift Templates", impliedBy: "canManageRecurringShifts" },
  { key: "canViewFocusAreas", label: "Focus Areas", impliedBy: "canManageFocusAreas" },
  { key: "canViewShiftCodes", label: "Shift Codes", impliedBy: "canManageShiftCodes" },
  { key: "canViewIndicatorTypes", label: "Indicator Types", impliedBy: "canManageIndicatorTypes" },
  { key: "canViewOrgLabels", label: "Custom Labels", impliedBy: "canManageOrgLabels" },
  { key: "canViewCoverageRequirements", label: "Coverage Requirements", impliedBy: "canManageCoverageRequirements" },
  { key: "canViewDashboardAnalytics", label: "Dashboard Analytics" },
];

// ── Section 2: Management Permissions ───────────────────────────────────────
interface ManagePermEntry {
  key: keyof AdminPermissions;
  label: string;
  /** Which view permission this management action implies. */
  implies?: keyof AdminPermissions;
}

const MANAGEMENT_GROUPS: { label: string; permissions: ManagePermEntry[] }[] = [
  {
    label: "Scheduling",
    permissions: [
      { key: "canEditShifts", label: "Edit Shifts" },
      { key: "canPublishSchedule", label: "Publish Schedule" },
      { key: "canApplyRecurringSchedule", label: "Apply Recurring Templates" },
      { key: "canApproveShiftRequests", label: "Approve Shift Requests" },
    ],
  },
  {
    label: "Content",
    permissions: [
      { key: "canEditNotes", label: "Edit Notes / Indicators" },
    ],
  },
  {
    label: "Staff",
    permissions: [
      { key: "canManageEmployees", label: "Manage Employees", implies: "canViewEmployeeDetails" },
    ],
  },
  {
    label: "Shift Templates",
    permissions: [
      { key: "canManageRecurringShifts", label: "Manage Recurring Shifts", implies: "canViewRecurringShifts" },
      { key: "canManageShiftSeries", label: "Manage Shift Series" },
    ],
  },
  {
    label: "Organization Config",
    permissions: [
      { key: "canManageFocusAreas", label: "Manage Focus Areas", implies: "canViewFocusAreas" },
      { key: "canManageShiftCodes", label: "Manage Shift Codes", implies: "canViewShiftCodes" },
      { key: "canManageIndicatorTypes", label: "Manage Indicator Types", implies: "canViewIndicatorTypes" },
      { key: "canManageOrgLabels", label: "Manage Custom Labels", implies: "canViewOrgLabels" },
      { key: "canManageCoverageRequirements", label: "Manage Coverage Requirements", implies: "canViewCoverageRequirements" },
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
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
  </svg>
);

// ── Section header style ──────────────────────────────────────────────────────
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: "var(--dg-fs-label)",
  fontWeight: 700,
  color: "var(--color-text-primary)",
  marginBottom: 4,
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const sectionSubtitleStyle: React.CSSProperties = {
  fontSize: "var(--dg-fs-caption)",
  color: "var(--color-text-muted)",
  marginBottom: 12,
  lineHeight: 1.4,
};

const groupLabelStyle: React.CSSProperties = {
  fontSize: "var(--dg-fs-footnote)",
  fontWeight: 700,
  color: "var(--color-text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
  marginTop: 12,
};

// ── Component ─────────────────────────────────────────────────────────────────

interface PermissionsEditorProps {
  title: string;
  subtitle: React.ReactNode;
  initialPermissions: AdminPermissions | null | undefined;
  showPermissionCounter?: boolean;
  /** Permission keys that should be forcibly locked to false and excluded from toggles. */
  lockedFalse?: (keyof AdminPermissions)[];
  onSave: (perms: AdminPermissions) => Promise<void>;
  onClose: () => void;
}

export default function PermissionsEditor({
  title,
  subtitle,
  initialPermissions,
  showPermissionCounter,
  lockedFalse,
  onSave,
  onClose,
}: PermissionsEditorProps) {
  const lockedFalseSet = new Set(lockedFalse ?? []);

  const [perms, setPerms] = useState<AdminPermissions>(() => {
    const initial: AdminPermissions = {
      ...DEFAULT_PERMISSIONS,
      ...(initialPermissions ?? {}),
      canViewSchedule: true,
      canViewStaff: true,
    };
    // Force locked permissions to false
    for (const key of lockedFalseSet) {
      (initial as unknown as Record<string, boolean>)[key] = false;
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);

  function toggle(key: keyof AdminPermissions) {
    setPerms((prev) => {
      const next = { ...prev };
      const newVal = !prev[key];
      (next as unknown as Record<string, boolean>)[key] = newVal;

      if (newVal) {
        // Enabling an edit permission → auto-enable its implied view permission
        const pair = VIEW_EDIT_PAIRS.find((p) => p.edit === key);
        if (pair) (next as unknown as Record<string, boolean>)[pair.view] = true;
      } else {
        // Disabling a view permission → auto-disable its paired edit permission
        const pair = VIEW_EDIT_PAIRS.find((p) => p.view === key);
        if (pair) (next as unknown as Record<string, boolean>)[pair.edit] = false;
      }

      return next;
    });
  }

  // Collect all toggleable permission keys (for Select All / Clear All / counter)
  const allKeys = [
    ...VIEW_PERMISSIONS.map((p) => p.key),
    ...MANAGEMENT_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)),
  ].filter((k) => !lockedFalseSet.has(k));

  function selectAll() {
    setPerms((prev) => {
      const next = { ...prev };
      for (const key of allKeys) {
        (next as unknown as Record<string, boolean>)[key] = true;
      }
      return next;
    });
  }

  function clearAll() {
    setPerms((prev) => {
      const next = { ...prev };
      for (const key of allKeys) {
        (next as unknown as Record<string, boolean>)[key] = false;
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(perms);
      onClose();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) ?? "Failed to update permissions");
    } finally {
      setSaving(false);
    }
  }

  const enabledCount = allKeys.filter((k) => perms[k] === true).length;

  return (
    <Modal title={title} onClose={onClose} style={{ maxWidth: 540 }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)", marginBottom: 12, flexShrink: 0, lineHeight: 1.5 }}>
          {subtitle}
          {showPermissionCounter && (
            <>
              <br />
              <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-faint)" }}>
                {enabledCount} of {allKeys.length} permissions enabled
              </span>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexShrink: 0 }}>
          <button className="dg-btn dg-btn-ghost" onClick={selectAll} style={{ fontSize: "var(--dg-fs-caption)" }}>Select All</button>
          <button className="dg-btn dg-btn-ghost" onClick={clearAll} style={{ fontSize: "var(--dg-fs-caption)" }}>Clear All</button>
        </div>

        {/* ── Scrollable content ──────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>

          {/* ── Section 1: View Access ────────────────────────────────── */}
          <div style={sectionHeaderStyle}>
            <EyeIcon /> View Access
          </div>
          <div style={sectionSubtitleStyle}>
            Schedule and Staff List are always visible. Enabling a management action below also grants its related view access.
          </div>
          <div style={{ marginBottom: 20 }}>
            {VIEW_PERMISSIONS.map((vp) => {
              const checked = perms[vp.key] === true;
              const isImplied = vp.impliedBy ? perms[vp.impliedBy] === true : false;
              return (
                <label
                  key={vp.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "5px 0",
                    cursor: isImplied ? "default" : "pointer",
                    fontSize: "var(--dg-fs-label)",
                    color: isImplied ? "var(--color-text-muted)" : "var(--color-text-primary)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isImplied}
                    onChange={() => toggle(vp.key)}
                    style={{ width: 16, height: 16, cursor: isImplied ? "default" : "pointer" }}
                  />
                  {vp.label}
                </label>
              );
            })}
          </div>

          {/* ── Divider ───────────────────────────────────────────────── */}
          <div style={{ borderTop: "1px solid var(--color-border-light)", marginBottom: 16 }} />

          {/* ── Section 2: Management Permissions ─────────────────────── */}
          <div style={sectionHeaderStyle}>
            <PencilIcon /> Management Permissions
          </div>
          <div style={sectionSubtitleStyle}>
            What can members change?
          </div>
          {MANAGEMENT_GROUPS.map((group) => (
            <div key={group.label}>
              <div style={groupLabelStyle}>{group.label}</div>
              {group.permissions.map((mp) => {
                if (lockedFalseSet.has(mp.key)) return null;
                const checked = perms[mp.key] === true;
                return (
                  <label
                    key={mp.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "5px 0",
                      cursor: "pointer",
                      fontSize: "var(--dg-fs-label)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(mp.key)}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                    {mp.label}
                  </label>
                );
              })}
            </div>
          ))}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
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

/** Count how many configurable permissions are enabled in an AdminPermissions object. */
export function countEnabledPermissions(perms: AdminPermissions | null | undefined): { enabled: number; total: number } {
  const allKeys = [
    ...VIEW_PERMISSIONS.map((p) => p.key),
    ...MANAGEMENT_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)),
  ];
  const total = allKeys.length;
  if (!perms) return { enabled: 0, total };
  const enabled = allKeys.filter((k) => perms[k] === true).length;
  return { enabled, total };
}
