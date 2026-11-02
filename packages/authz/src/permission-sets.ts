import type { AdminPermissions } from "@dubgrid/domain";

export const ALL_PERMS: AdminPermissions = {
  canViewSchedule: true,
  canEditShifts: true,
  canPublishSchedule: true,
  canApplyRecurringSchedule: true,
  canEditNotes: true,
  canViewRecurringShifts: true,
  canManageRecurringShifts: true,
  canManageShiftSeries: true,
  canViewStaff: true,
  canViewEmployeeDetails: true,
  canManageEmployees: true,
  canViewFocusAreas: true,
  canManageFocusAreas: true,
  canViewScheduleDefinitions: true,
  canManageScheduleDefinitions: true,
  canViewIndicatorTypes: true,
  canManageIndicatorTypes: true,
  canManageOrgSettings: true,
  canViewOrgLabels: true,
  canManageOrgLabels: true,
  canViewCoverageRequirements: true,
  canManageCoverageRequirements: true,
  canApproveShiftRequests: true,
  canViewDashboardAnalytics: true,
  canViewReports: true,
};

export const READ_ONLY_PERMS: AdminPermissions = {
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
  canViewReports: false,
};

/**
 * What an admin can do before a super admin configures anything: the core
 * scheduling operations, and nothing in people management or administration.
 * A stored set resolves against this, so a key it never mentions (one added
 * after the row was written, or a row that was never configured) lands here
 * rather than on the user baseline. The editor starts from the same set.
 */
export const ADMIN_DEFAULT_PERMS: AdminPermissions = {
  ...READ_ONLY_PERMS,
  canEditShifts: true,
  canPublishSchedule: true,
  canEditNotes: true,
  canViewRecurringShifts: true,
  canManageRecurringShifts: true,
  canApplyRecurringSchedule: true,
  canManageShiftSeries: true,
  canViewReports: true,
};

/**
 * Every view permission and the keys that grant it on their own. This is the
 * one place the rule lives: the resolver applies it, and the permissions
 * editor reads it so a switch never appears live when the resolver would
 * override it.
 */
export const VIEW_IMPLICATIONS: Partial<
  Record<keyof AdminPermissions, readonly (keyof AdminPermissions)[]>
> = {
  canViewEmployeeDetails: ["canManageEmployees"],
  canViewFocusAreas: ["canManageFocusAreas"],
  canViewScheduleDefinitions: ["canManageScheduleDefinitions"],
  canViewIndicatorTypes: ["canManageIndicatorTypes"],
  canViewCoverageRequirements: ["canManageCoverageRequirements"],
  canViewRecurringShifts: ["canManageRecurringShifts"],
  canViewOrgLabels: ["canManageOrgLabels"],
  canViewDashboardAnalytics: [
    "canEditShifts",
    "canManageEmployees",
    "canPublishSchedule",
    "canApproveShiftRequests",
  ],
};
