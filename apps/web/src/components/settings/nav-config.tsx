"use client";

import React from "react";

// ── Section IDs ──────────────────────────────────────────────────────────────
export type SectionId =
  | "org-general" | "org-billing" | "org-labels" | "org-activity" | "org-display"
  | "schedule-rules" | "schedule-shifts" | "schedule-jobs" | "schedule-absence-types" | "schedule-coverage"
  | "staff-certifications" | "staff-roles" | "staff-departments" | "staff-indicators"
  | "platform-impersonation" | "org-danger";

export const VALID_SECTIONS: SectionId[] = [
  "org-general", "org-billing", "org-labels", "org-activity", "org-display",
  "schedule-rules", "schedule-shifts", "schedule-jobs", "schedule-absence-types", "schedule-coverage",
  "staff-certifications", "staff-roles", "staff-departments", "staff-indicators",
  "platform-impersonation", "org-danger",
];

// ── Backwards-compatible URL mapping ─────────────────────────────────────────
const OLD_TO_NEW: Record<string, SectionId> = {
  "organization": "org-general",
  "display-mode": "org-display",
  "shift-categories": "schedule-shifts",
  "shift-codes": "schedule-jobs",
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
const iconBilling = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>;
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
const iconActivity = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>;
const iconDanger = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;

// ── Nav Item / Group types ───────────────────────────────────────────────────
export interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
  helpHint?: string;
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
  canManageScheduleDefinitions: boolean;
  canViewScheduleDefinitions: boolean;
  canManageIndicatorTypes: boolean;
  canViewIndicatorTypes: boolean;
  canManageOrgSettings: boolean;
  canManageCoverageRequirements: boolean;
  canViewCoverageRequirements: boolean;
}

export function buildNavGroups(
  perms: NavPermissions,
  overrides?: { focusAreaLabel?: string; certificationLabel?: string; roleLabel?: string },
): NavGroup[] {
  const groups: NavGroup[] = [];

  if (perms.canAccessSettings) {
    const orgItems: NavItem[] = [];
    if (perms.isSuperAdmin) orgItems.push({ id: "org-general", label: "Organization Details", icon: iconBuilding, description: "Manage your organization's name and basic profile information." });
    if (perms.isSuperAdmin || perms.isGridmaster) orgItems.push({ id: "org-billing", label: "Billing", icon: iconBilling, helpHint: "Seats are based on active organization users, not employees.", description: "Review subscription status, seats, and Stripe billing access." });
    if (perms.isSuperAdmin || perms.canManageOrgLabels || perms.canViewOrgLabels) orgItems.push({ id: "org-labels", label: "Customization", icon: iconLabels, helpHint: "Labels rename visible wording across DubGrid but do not change behavior.", description: "Customize the terminology used in your organization. For example, rename 'Focus Areas' to 'Wings' or 'Units'." });
    if (perms.canManageFocusAreas || perms.canViewFocusAreas || perms.canManageOrgLabels || perms.canViewOrgLabels) orgItems.push({ id: "staff-departments", label: "Departments", icon: iconDepartment, helpHint: "Scheduled departments drive the grid; management departments are app-only.", description: "Includes scheduled departments for the grid and management departments for app-only staff." });
    if (perms.isSuperAdmin) orgItems.push({ id: "org-activity", label: "Activity Log", icon: iconActivity, helpHint: "A record of changes made across your organization.", description: "Review the audit trail of role, membership, billing, and configuration changes across your organization." });
    if (orgItems.length > 0) groups.push({ id: "organization", label: "Organization", items: orgItems });
  }

  if (perms.canAccessSettings) {
    const staffItems: NavItem[] = [];
    if (perms.canManageOrgLabels || perms.canViewOrgLabels) staffItems.push({ id: "staff-roles", label: overrides?.roleLabel ?? "Roles", icon: iconRoles, helpHint: "Roles are visible tags; only schedule-eligible roles can gate jobs.", description: "Manage visible role tags and choose which ones actually count for job eligibility on the schedule." });
    if (perms.canManageOrgLabels || perms.canViewOrgLabels) staffItems.push({ id: "staff-certifications", label: overrides?.certificationLabel ?? "Certifications", icon: iconDesignations, helpHint: "Certifications can display on staff and can restrict assignments.", description: "The certification badge shown next to the employee's name on the schedule grid." });
    if (staffItems.length > 0) groups.push({ id: "staff", label: "Staff & Designations", items: staffItems });
  }

  if (perms.canAccessSettings) {
    const schedItems: NavItem[] = [];
    if (perms.canManageOrgSettings) schedItems.push({ id: "org-display", label: "Shift Display Mode", icon: iconDisplay, helpHint: "Choose between readable full names and denser short shift codes.", description: "Choose how shifts appear on the schedule grid — short codes or full names." });
    if (perms.isSuperAdmin) schedItems.push({ id: "schedule-rules", label: "Schedule Rules", icon: iconRules, description: "Configure automated scheduling rules and constraints." });
    if (perms.canManageScheduleDefinitions || perms.canViewScheduleDefinitions) schedItems.push({ id: "schedule-shifts", label: "Shifts", icon: iconTag, description: "Configure your core Day, Evening, Night, and similar shift definitions with default times and colors." });
    if (perms.canManageScheduleDefinitions || perms.canViewScheduleDefinitions) schedItems.push({ id: "schedule-jobs", label: "Jobs", icon: iconCalendar, helpHint: "Jobs can be scheduled or general and can restrict qualification.", description: "Define responsibilities like Supervisor, Mentor, Nurse, and Office, including assignment rules and grid visibility." });
    if (perms.canManageScheduleDefinitions || perms.canViewScheduleDefinitions) schedItems.push({ id: "schedule-absence-types", label: "Absence Types", icon: iconCalendar, helpHint: "Absences replace worked assignments and are excluded from coverage.", description: "Manage PTO, sick, vacation, calloff, and other non-worked schedule labels." });
    if (perms.canManageCoverageRequirements || perms.canViewCoverageRequirements) schedItems.push({ id: "schedule-coverage", label: "Coverage", icon: iconCoverage, helpHint: "Coverage sets minimum headcount by focus area, shift, and job.", description: "Set minimum staffing requirements by focus area and assignable shift/job combination." });
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

  if (perms.isSuperAdmin) {
    groups.push({
      id: "danger",
      label: "Danger Zone",
      items: [
        { id: "org-danger", label: "Delete Organization", icon: iconDanger, helpHint: "This cancels billing and removes access for everyone.", description: "Permanently close this organization. Billing stops and all members lose access." },
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
export function getMaxWidth(section: SectionId): number {
  if (section === "org-billing") {
    return 980;
  }

  if (section === "schedule-jobs") {
    return 1120;
  }

  if (section === "staff-roles" || section === "staff-certifications") {
    return 1120;
  }

  if (section === "org-activity") {
    return 1120;
  }

  return 860;
}
