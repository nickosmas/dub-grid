"use client";

import React from "react";

// ── Section IDs ──────────────────────────────────────────────────────────────
export type SectionId =
  | "org-general" | "org-labels" | "org-display"
  | "schedule-rules" | "schedule-categories" | "schedule-codes" | "schedule-coverage"
  | "staff-certifications" | "staff-roles" | "staff-departments" | "staff-indicators"
  | "platform-impersonation";

export const VALID_SECTIONS: SectionId[] = [
  "org-general", "org-labels", "org-display",
  "schedule-rules", "schedule-categories", "schedule-codes", "schedule-coverage",
  "staff-certifications", "staff-roles", "staff-departments", "staff-indicators",
  "platform-impersonation",
];

// ── Backwards-compatible URL mapping ─────────────────────────────────────────
const OLD_TO_NEW: Record<string, SectionId> = {
  "organization": "org-general",
  "display-mode": "org-display",
  "shift-categories": "schedule-categories",
  "shift-codes": "schedule-codes",
  "coverage": "schedule-coverage",
  "indicators": "staff-indicators",
  "staff-config": "staff-certifications",
  "impersonation": "platform-impersonation",
  "staff-focus-areas": "staff-departments",
};

export function resolveSection(raw: string | null): SectionId | null {
  if (!raw) return null;
  if (VALID_SECTIONS.includes(raw as SectionId)) return raw as SectionId;
  return OLD_TO_NEW[raw] ?? null;
}

// ── Icons ────────────────────────────────────────────────────────────────────
const iconBuilding = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const iconLabels = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
const iconDisplay = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>;
const iconRules = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const iconTag = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
const iconCalendar = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const iconCoverage = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>;
const iconDesignations = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>;
const iconRoles = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>;
const iconDepartment = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const iconIndicator = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>;
const iconImpersonate = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

// ── Nav Item / Group types ───────────────────────────────────────────────────
export interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
  description?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

// ── Permission-based nav builder ─────────────────────────────────────────────
export interface NavPermissions {
  canManageOrg: boolean;
  canAccessSettings: boolean;
  isSuperAdmin: boolean;
  isGridmaster: boolean;
  canManageOrgLabels: boolean;
  canViewOrgLabels: boolean;
  canManageFocusAreas: boolean;
  canViewFocusAreas: boolean;
  canManageShiftCodes: boolean;
  canViewShiftCodes: boolean;
  canManageIndicatorTypes: boolean;
  canViewIndicatorTypes: boolean;
  canManageOrgSettings: boolean;
  canManageCoverageRequirements: boolean;
  canViewCoverageRequirements: boolean;
}

export function buildNavGroups(
  perms: NavPermissions,
  overrides?: { shiftCodesLabel?: string; focusAreaLabel?: string; certificationLabel?: string; roleLabel?: string; departmentLabel?: string },
): NavGroup[] {
  const groups: NavGroup[] = [];

  if (perms.canAccessSettings) {
    const orgItems: NavItem[] = [];
    if (perms.isSuperAdmin) orgItems.push({ id: "org-general", label: "Organization Details", icon: iconBuilding, description: "Manage your organization's name and basic profile information." });
    if (perms.isSuperAdmin || perms.canManageOrgLabels || perms.canViewOrgLabels) orgItems.push({ id: "org-labels", label: "Custom Labels", icon: iconLabels, description: "Customize the terminology used in your organization. For example, rename 'Focus Areas' to 'Wings' or 'Units'." });
    if (orgItems.length > 0) groups.push({ id: "organization", label: "Organization", items: orgItems });
  }

  if (perms.canAccessSettings) {
    const staffItems: NavItem[] = [];
    if (perms.canManageFocusAreas || perms.canViewFocusAreas || perms.canManageOrgLabels || perms.canViewOrgLabels) staffItems.push({ id: "staff-departments", label: overrides?.departmentLabel ?? "Departments", icon: iconDepartment, description: "Organize your workforce into scheduled and management departments, and define focus areas within each." });
    if (perms.canManageOrgLabels || perms.canViewOrgLabels) staffItems.push({ id: "staff-roles", label: overrides?.roleLabel ?? "Roles", icon: iconRoles, description: "Display roles shown as tags on the schedule grid (e.g., Supervisor). These are cosmetic and don't affect permissions." });
    if (perms.canManageOrgLabels || perms.canViewOrgLabels) staffItems.push({ id: "staff-certifications", label: overrides?.certificationLabel ?? "Certifications", icon: iconDesignations, description: "The certification badge shown next to the employee's name on the schedule grid." });
    if (staffItems.length > 0) groups.push({ id: "staff", label: "Staff & Designations", items: staffItems });
  }

  if (perms.canAccessSettings) {
    const schedItems: NavItem[] = [];
    if (perms.canManageOrgSettings) schedItems.push({ id: "org-display", label: "Shift Display Mode", icon: iconDisplay, description: "Choose how shifts appear on the schedule grid — short codes or full names." });
    if (perms.isSuperAdmin) schedItems.push({ id: "schedule-rules", label: "Schedule Rules", icon: iconRules, description: "Configure automated scheduling rules and constraints." });
    if (perms.canManageShiftCodes || perms.canViewShiftCodes) schedItems.push({ id: "schedule-categories", label: "Shift Categories", icon: iconTag, description: "Group shifts by type (e.g. Day, Evening, Night) with default times and colors." });
    if (perms.canManageShiftCodes || perms.canViewShiftCodes) schedItems.push({ id: "schedule-codes", label: overrides?.shiftCodesLabel ?? "Schedule Codes", icon: iconCalendar, description: "Define the individual shifts available for scheduling, including codes, names, times, and required certifications." });
    if (perms.canManageCoverageRequirements || perms.canViewCoverageRequirements) schedItems.push({ id: "schedule-coverage", label: "Coverage", icon: iconCoverage, description: "Set minimum staffing requirements per shift and day so the schedule can flag when coverage falls short." });
    if (perms.canManageIndicatorTypes || perms.canViewIndicatorTypes) schedItems.push({ id: "staff-indicators", label: "Indicators", icon: iconIndicator, description: "Define custom indicators that can be attached to shift cells on the schedule." });
    if (schedItems.length > 0) groups.push({ id: "scheduling", label: "Scheduling", items: schedItems });
  }

  if (perms.isGridmaster) {
    groups.push({
      id: "platform",
      label: "Platform",
      items: [
        { id: "platform-impersonation", label: "Impersonation", icon: iconImpersonate, description: "Temporarily access an organization's account as any of its users for support or debugging." },
      ],
    });
  }

  return groups;
}

/** Get the first visible section ID based on permissions. */
export function getDefaultSection(perms: NavPermissions): SectionId {
  const groups = buildNavGroups(perms);
  return groups[0]?.items[0]?.id ?? "platform-impersonation";
}

/** Get max content width for a section. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getMaxWidth(section: SectionId): number {
  return 860;
}
