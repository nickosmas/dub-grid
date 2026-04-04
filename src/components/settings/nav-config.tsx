"use client";

import React from "react";

// ── Section IDs ──────────────────────────────────────────────────────────────
export type SectionId =
  | "org-general" | "org-labels" | "org-display"
  | "schedule-rules" | "schedule-categories" | "schedule-codes" | "schedule-coverage"
  | "staff-focus-areas" | "staff-certifications" | "staff-roles" | "staff-indicators"
  | "platform-impersonation";

export const VALID_SECTIONS: SectionId[] = [
  "org-general", "org-labels", "org-display",
  "schedule-rules", "schedule-categories", "schedule-codes", "schedule-coverage",
  "staff-focus-areas", "staff-certifications", "staff-roles", "staff-indicators",
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
const iconFocusArea = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
const iconDesignations = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>;
const iconRoles = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>;
const iconIndicator = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>;
const iconImpersonate = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

// ── Nav Item / Group types ───────────────────────────────────────────────────
export interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

// ── Permission-based nav builder ─────────────────────────────────────────────
export interface NavPermissions {
  canManageOrg: boolean;
  isSuperAdmin: boolean;
  isGridmaster: boolean;
  canManageOrgLabels: boolean;
  canManageFocusAreas: boolean;
  canManageShiftCodes: boolean;
  canManageIndicatorTypes: boolean;
  canManageOrgSettings: boolean;
  canManageCoverageRequirements: boolean;
}

export function buildNavGroups(
  perms: NavPermissions,
  overrides?: { shiftCodesLabel?: string; focusAreaLabel?: string; certificationLabel?: string; roleLabel?: string },
): NavGroup[] {
  const groups: NavGroup[] = [];

  if (perms.canManageOrg) {
    const orgItems: NavItem[] = [];
    if (perms.isSuperAdmin) orgItems.push({ id: "org-general", label: "General", icon: iconBuilding });
    if (perms.isSuperAdmin || perms.canManageOrgLabels) orgItems.push({ id: "org-labels", label: "Custom Labels", icon: iconLabels });
    if (perms.canManageOrgSettings) orgItems.push({ id: "org-display", label: "Display Mode", icon: iconDisplay });
    if (orgItems.length > 0) groups.push({ id: "organization", label: "Organization", items: orgItems });
  }

  if (perms.canManageOrg) {
    const schedItems: NavItem[] = [];
    if (perms.isSuperAdmin) schedItems.push({ id: "schedule-rules", label: "Schedule Rules", icon: iconRules });
    if (perms.canManageShiftCodes) schedItems.push({ id: "schedule-categories", label: "Shift Categories", icon: iconTag });
    if (perms.canManageShiftCodes) schedItems.push({ id: "schedule-codes", label: overrides?.shiftCodesLabel ?? "Schedule Codes", icon: iconCalendar });
    if (perms.canManageCoverageRequirements) schedItems.push({ id: "schedule-coverage", label: "Coverage", icon: iconCoverage });
    if (schedItems.length > 0) groups.push({ id: "scheduling", label: "Scheduling", items: schedItems });
  }

  if (perms.canManageOrg) {
    const staffItems: NavItem[] = [];
    if (perms.canManageFocusAreas) staffItems.push({ id: "staff-focus-areas", label: overrides?.focusAreaLabel ?? "Focus Areas", icon: iconFocusArea });
    if (perms.canManageOrgLabels) staffItems.push({ id: "staff-certifications", label: overrides?.certificationLabel ?? "Certifications", icon: iconDesignations });
    if (perms.canManageOrgLabels) staffItems.push({ id: "staff-roles", label: overrides?.roleLabel ?? "Roles", icon: iconRoles });
    if (perms.canManageIndicatorTypes) staffItems.push({ id: "staff-indicators", label: "Indicators", icon: iconIndicator });
    if (staffItems.length > 0) groups.push({ id: "staff", label: "Staff & Designations", items: staffItems });
  }

  if (perms.isGridmaster) {
    groups.push({
      id: "platform",
      label: "Platform",
      items: [
        { id: "platform-impersonation", label: "Impersonation", icon: iconImpersonate },
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
