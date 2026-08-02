"use client";

import React from "react";
import {
  BuildingIcon,
  BillingIcon,
  LabelsIcon,
  DisplayIcon,
  ShieldIcon,
  DepartmentsIcon,
  ShiftsIcon,
  JobsIcon,
  AbsenceIcon,
  CoverageIcon,
  AwardIcon,
  RolesIcon,
  IndicatorIcon,
  ActivityIcon,
  DangerIcon,
  type NavIconProps,
} from "@/components/icons/NavIcons";

// ── Section IDs ──────────────────────────────────────────────────────────────
export type SectionId =
  | "org-general"
  | "org-billing"
  | "org-labels"
  | "org-activity"
  | "org-display"
  | "schedule-rules"
  | "schedule-shifts"
  | "schedule-jobs"
  | "schedule-absence-types"
  | "schedule-coverage"
  | "staff-certifications"
  | "staff-roles"
  | "staff-departments"
  | "staff-indicators"
  | "org-danger";

export const VALID_SECTIONS: SectionId[] = [
  "org-general",
  "org-billing",
  "org-labels",
  "org-activity",
  "org-display",
  "schedule-rules",
  "schedule-shifts",
  "schedule-jobs",
  "schedule-absence-types",
  "schedule-coverage",
  "staff-certifications",
  "staff-roles",
  "staff-departments",
  "staff-indicators",
  "org-danger",
];

// ── Backwards-compatible URL mapping ─────────────────────────────────────────
const OLD_TO_NEW: Record<string, SectionId> = {
  organization: "org-general",
  "display-mode": "org-display",
  "shift-categories": "schedule-shifts",
  "shift-codes": "schedule-jobs",
  coverage: "schedule-coverage",
  indicators: "staff-indicators",
  "staff-config": "staff-certifications",
  impersonation: "org-general",
  "staff-focus-areas": "staff-departments",
};

export function resolveSection(raw: string | null): SectionId | null {
  if (!raw) return null;
  if (VALID_SECTIONS.includes(raw as SectionId)) return raw as SectionId;
  return OLD_TO_NEW[raw] ?? null;
}

// ── Nav Item / Group types ───────────────────────────────────────────────────
export type NavIconComponent = React.ComponentType<NavIconProps>;

export interface NavItem {
  id: SectionId;
  label: string;
  Icon: NavIconComponent;
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

  // General — basic org identity + terminology
  if (perms.canAccessSettings) {
    const generalItems: NavItem[] = [];
    if (perms.isSuperAdmin)
      generalItems.push({
        id: "org-general",
        label: "Organization Details",
        Icon: BuildingIcon,
        description: "Manage your organization's name and basic profile information.",
      });
    if (perms.isSuperAdmin || perms.canManageOrgLabels || perms.canViewOrgLabels)
      generalItems.push({
        id: "org-labels",
        label: "Labels",
        Icon: LabelsIcon,
        helpHint: "Labels rename visible wording across DubGrid but do not change behavior.",
        description:
          "Customize the terminology used in your organization. For example, rename 'Focus Areas' to 'Wings' or 'Units'.",
      });
    if (generalItems.length > 0)
      groups.push({ id: "general", label: "General", items: generalItems });
  }

  // Staff designations — taxonomy that classifies who works here. Comes
  // before Scheduling because departments, roles, and certifications are
  // prerequisites for the scheduling config that references them.
  if (perms.canAccessSettings) {
    const staffItems: NavItem[] = [];
    if (
      perms.canManageFocusAreas ||
      perms.canViewFocusAreas ||
      perms.canManageOrgLabels ||
      perms.canViewOrgLabels
    )
      staffItems.push({
        id: "staff-departments",
        label: "Departments",
        Icon: DepartmentsIcon,
        helpHint: "Scheduled departments drive the grid; management departments are app-only.",
        description:
          "Includes scheduled departments for the grid and management departments for app-only staff.",
      });
    if (perms.canManageOrgLabels || perms.canViewOrgLabels)
      staffItems.push({
        id: "staff-roles",
        label: overrides?.roleLabel ?? "Roles",
        Icon: RolesIcon,
        helpHint: "Roles are visible tags; only schedule-eligible roles can gate jobs.",
        description:
          "Manage visible role tags and choose which ones actually count for job eligibility on the schedule.",
      });
    if (perms.canManageOrgLabels || perms.canViewOrgLabels)
      staffItems.push({
        id: "staff-certifications",
        label: overrides?.certificationLabel ?? "Certifications",
        Icon: AwardIcon,
        helpHint: "Certifications can display on staff and can restrict assignments.",
        description:
          "The certification badge shown next to the employee's name on the schedule grid.",
      });
    if (staffItems.length > 0)
      groups.push({ id: "staff", label: "Staff designations", items: staffItems });
  }

  // Scheduling — operational config used by anyone running the schedule
  if (perms.canAccessSettings) {
    const schedItems: NavItem[] = [];
    if (perms.canManageOrgSettings)
      schedItems.push({
        id: "org-display",
        label: "Shift Display Mode",
        Icon: DisplayIcon,
        helpHint: "Choose between readable full names and denser short shift codes.",
        description: "Choose how shifts appear on the schedule grid: short codes or full names.",
      });
    if (perms.isSuperAdmin)
      schedItems.push({
        id: "schedule-rules",
        label: "Schedule Rules",
        Icon: ShieldIcon,
        description: "Configure automated scheduling rules and constraints.",
      });
    if (perms.canManageScheduleDefinitions || perms.canViewScheduleDefinitions)
      schedItems.push({
        id: "schedule-shifts",
        label: "Shifts",
        Icon: ShiftsIcon,
        description:
          "Configure your core Day, Evening, Night, and similar shift definitions with default times and colors.",
      });
    if (perms.canManageScheduleDefinitions || perms.canViewScheduleDefinitions)
      schedItems.push({
        id: "schedule-jobs",
        label: "Jobs",
        Icon: JobsIcon,
        helpHint: "Jobs can be scheduled or general and can restrict qualification.",
        description:
          "Define responsibilities like Supervisor, Mentor, Nurse, and Office, including assignment rules and grid visibility.",
      });
    if (perms.canManageScheduleDefinitions || perms.canViewScheduleDefinitions)
      schedItems.push({
        id: "schedule-absence-types",
        label: "Absence Types",
        Icon: AbsenceIcon,
        helpHint: "Absences replace worked assignments and are excluded from coverage.",
        description: "Manage PTO, sick, vacation, calloff, and other non-worked schedule labels.",
      });
    if (perms.canManageCoverageRequirements || perms.canViewCoverageRequirements)
      schedItems.push({
        id: "schedule-coverage",
        label: "Coverage",
        Icon: CoverageIcon,
        helpHint: "Coverage sets minimum headcount by focus area, shift, and job.",
        description:
          "Set minimum staffing requirements by focus area and assignable shift/job combination.",
      });
    if (perms.canManageIndicatorTypes || perms.canViewIndicatorTypes)
      schedItems.push({
        id: "staff-indicators",
        label: "Indicators",
        Icon: IndicatorIcon,
        description:
          "Define custom indicators that can be attached to shift cells on the schedule.",
      });
    if (schedItems.length > 0)
      groups.push({ id: "scheduling", label: "Scheduling", items: schedItems });
  }

  // Billing — own group, not buried under Organization
  if (perms.isSuperAdmin || perms.isGridmaster) {
    groups.push({
      id: "billing",
      label: "Billing",
      items: [
        {
          id: "org-billing",
          label: "Subscription",
          Icon: BillingIcon,
          helpHint: "Seats are based on active organization users, not employees.",
          description: "Review subscription status, seats, and Stripe billing access.",
        },
      ],
    });
  }

  // Audit — promoted out of the footer; admin oversight, not a debug tool
  if (perms.isSuperAdmin) {
    groups.push({
      id: "audit",
      label: "Audit",
      items: [
        {
          id: "org-activity",
          label: "Activity Log",
          Icon: ActivityIcon,
          helpHint: "A record of changes made across your organization.",
          description:
            "Review the audit trail of role, membership, billing, and configuration changes across your organization.",
        },
      ],
    });
  }

  // Danger zone — pinned to the sidebar footer
  if (perms.isSuperAdmin) {
    groups.push({
      id: "danger",
      label: "Danger Zone",
      items: [
        {
          id: "org-danger",
          label: "Delete Organization",
          Icon: DangerIcon,
          helpHint: "This cancels billing and removes access for everyone.",
          description:
            "Permanently close this organization. Billing stops and all members lose access.",
        },
      ],
    });
  }

  return groups;
}

/** Get the first visible section ID based on permissions. */
export function getDefaultSection(perms: NavPermissions): SectionId {
  const groups = buildNavGroups(perms);
  return groups[0]?.items[0]?.id ?? "org-general";
}

/** Get max content width for a section. */
export function getMaxWidth(_section: SectionId): number {
  return 1120;
}
