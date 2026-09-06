export type PlatformRole = "gridmaster" | "none";

export type OrganizationRole = "super_admin" | "admin" | "user";

export type AssignableOrganizationRole = "super_admin" | "admin" | "user";

export interface AdminPermissions {
  canViewSchedule: boolean;
  canEditShifts: boolean;
  canPublishSchedule: boolean;
  canApplyRecurringSchedule: boolean;
  canEditNotes: boolean;
  canEditScheduleIndicators: boolean;
  canViewRecurringShifts: boolean;
  canManageRecurringShifts: boolean;
  canManageShiftSeries: boolean;
  canViewStaff: boolean;
  canViewEmployeeDetails: boolean;
  canManageEmployees: boolean;
  canViewFocusAreas: boolean;
  canManageFocusAreas: boolean;
  canViewScheduleDefinitions: boolean;
  canManageScheduleDefinitions: boolean;
  canViewIndicatorTypes: boolean;
  canManageIndicatorTypes: boolean;
  canManageOrgSettings: boolean;
  canViewOrgLabels: boolean;
  canManageOrgLabels: boolean;
  canViewCoverageRequirements: boolean;
  canManageCoverageRequirements: boolean;
  canApproveShiftRequests: boolean;
  canViewDashboardAnalytics: boolean;
  canViewReports: boolean;
}
