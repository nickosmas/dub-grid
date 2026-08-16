import { z } from "zod";
import {
  resolvedSchedulePresentationSchema,
  resolvedSchedulePresentationSegmentSchema,
  scheduleCellStateSchema,
} from "./schedule";
import {
  optionalStaffEmailSchema,
  optionalUsPhoneSchema,
  staffNameSchema,
  staffNotesSchema,
} from "./staff";

export const mobilePlatformSchema = z.enum(["ios", "android"]);
export const mobileRoleSchema = z.enum(["super_admin", "admin", "user"]);
export const mobileOrgSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
export const mobileShiftRequestTypeSchema = z.enum(["pickup", "swap", "calloff"]);
export const mobileShiftRequestStatusSchema = z.enum([
  "open",
  "pending_approval",
  "approved",
  "rejected",
  "cancelled",
  "expired",
]);

export const mobileUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});

export const mobileOrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: mobileOrgSlugSchema,
});

export const mobileOrganizationLookupResponseSchema = z.object({
  organization: mobileOrganizationSchema,
});

export const mobileAuthSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  tokenType: z.string().min(1),
});

export const mobileAuthLoginBodySchema = z.object({
  orgSlug: mobileOrgSlugSchema,
  email: z.string().email(),
  password: z.string().min(1),
});

export const mobileAuthLoginResponseSchema = z.object({
  session: mobileAuthSessionSchema,
  organization: mobileOrganizationSchema,
  user: mobileUserSchema,
  mfaRequired: z.boolean().default(false),
  mfa: z
    .object({
      factorId: z.string().min(1),
      friendlyName: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const mobileOrganizationSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string().nullable(),
  orgRole: z.enum(["super_admin", "admin", "user"]).nullable(),
  platformRole: z.enum(["gridmaster", "none"]),
  isCurrent: z.boolean(),
});

export const mobilePermissionsSchema = z.object({
  canViewSchedule: z.boolean(),
  canEditShifts: z.boolean(),
  canPublishSchedule: z.boolean(),
  canApplyRecurringSchedule: z.boolean(),
  canEditNotes: z.boolean(),
  canEditScheduleIndicators: z.boolean(),
  canViewRecurringShifts: z.boolean(),
  canManageRecurringShifts: z.boolean(),
  canManageShiftSeries: z.boolean(),
  canViewStaff: z.boolean(),
  canViewEmployeeDetails: z.boolean(),
  canManageEmployees: z.boolean(),
  canViewFocusAreas: z.boolean(),
  canManageFocusAreas: z.boolean(),
  canViewScheduleDefinitions: z.boolean(),
  canManageScheduleDefinitions: z.boolean(),
  canViewIndicatorTypes: z.boolean(),
  canManageIndicatorTypes: z.boolean(),
  canManageOrgSettings: z.boolean(),
  canViewOrgLabels: z.boolean(),
  canManageOrgLabels: z.boolean(),
  canViewCoverageRequirements: z.boolean(),
  canManageCoverageRequirements: z.boolean(),
  canApproveShiftRequests: z.boolean(),
  canViewDashboardAnalytics: z.boolean(),
  /**
   * Grant/revoke management access and set org roles — web gates this on
   * super_admin or gridmaster rather than on an admin permission. Defaults to
   * false so a newer client talking to an older server parses and simply
   * doesn't offer the affordance, rather than failing the whole bootstrap.
   */
  canManageManagementAccess: z.boolean().default(false),
});

export const mobileOrgConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string().nullable(),
  timezone: z.string().nullable(),
  // Anchors the "2 weeks" dashboard period to the org's actual pay-period
  // boundary (see @dubgrid/schedule-core's getDashboardPeriodStartIso) —
  // null falls back to a plain Sunday-aligned window.
  payPeriodStartDate: z.string().nullable().default(null),
  shiftDisplayMode: z.enum(["code", "name"]),
  labels: z.object({
    focusArea: z.string(),
    certification: z.string(),
    role: z.string(),
    department: z.string(),
  }),
  openShiftVisibility: z
    .object({
      coverageGap: z.enum(["hidden", "matched", "always"]),
      calloff: z.enum(["hidden", "matched", "always"]),
    })
    .default({ coverageGap: "matched", calloff: "matched" }),
  featureFlags: z.record(z.boolean()),
});

export const mobileLinkedEmployeeSchema = z
  .object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    status: z.enum(["active", "inactive", "removed"]),
    focusAreaIds: z.array(z.number().int()).default([]),
    departmentIds: z.array(z.number().int()).default([]),
  })
  .nullable();

export const mobileProfileLinkedEmployeeSchema = mobileLinkedEmployeeSchema
  .unwrap()
  .extend({
    employmentType: z.enum(["full_time", "part_time"]).default("full_time"),
    phone: z.string().default(""),
    email: z.string().default(""),
    certificationId: z.number().int().nullable().default(null),
    roleIds: z.array(z.number().int()).default([]),
    contactNotes: z.string().default(""),
    version: z.number().int().nonnegative().default(0),
  })
  .nullable();

export const mobileAbsenceTypeSchema = z.object({
  id: z.number().int(),
  label: z.string(),
  name: z.string().optional(),
  color: z.string().nullable().optional(),
  borderColor: z.string().nullable().optional(),
  textColor: z.string().nullable().optional(),
});

export const mobileFocusAreaSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  departmentId: z.number().int().nullable().optional(),
});

export const mobileNamedItemSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  abbr: z.string(),
});

export const mobileDepartmentSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  abbr: z.string(),
  type: z.enum(["scheduled", "management"]),
});

export const mobileBootstrapResponseSchema = z.object({
  user: mobileUserSchema,
  currentOrg: mobileOrgConfigSchema,
  memberships: z.array(mobileOrganizationSummarySchema),
  effectiveRole: mobileRoleSchema,
  permissions: mobilePermissionsSchema,
  linkedEmployee: mobileLinkedEmployeeSchema,
  absenceTypes: z.array(mobileAbsenceTypeSchema),
  focusAreas: z.array(mobileFocusAreaSchema),
  roles: z.array(mobileNamedItemSchema).default([]),
  certifications: z.array(mobileNamedItemSchema).default([]),
  departments: z.array(mobileDepartmentSchema).default([]),
  unreadNotificationCount: z.number().int().nonnegative(),
  // Defaults to true so a client talking to an older server that doesn't send
  // this field stays usable rather than being locked out of the app.
  acceptedCurrentTerms: z.boolean().default(true),
});

export const mobileTermsAcceptanceResponseSchema = z.object({
  acceptedCurrentTerms: z.literal(true),
});

export const mobileProfileUserSchema = mobileUserSchema.extend({
  createdAt: z.string().nullable(),
  lastSignInAt: z.string().nullable(),
  mfaEnabled: z.boolean(),
});

export const mobileProfileResponseSchema = z.object({
  user: mobileProfileUserSchema,
  currentOrg: mobileOrgConfigSchema,
  currentMembership: mobileOrganizationSummarySchema,
  effectiveRole: mobileRoleSchema,
  linkedEmployee: mobileProfileLinkedEmployeeSchema,
  focusAreas: z.array(mobileFocusAreaSchema),
  pendingProfileChangeRequest: z.boolean().default(false),
  pendingAccountDeletionRequest: z.boolean().default(false),
});

export const mobileProfileAccountUpdateBodySchema = z.object({
  firstName: z.string().trim().min(1).max(80).nullable(),
  lastName: z.string().trim().min(1).max(80).nullable(),
});

export const mobileProfileAccountUpdateResponseSchema = z.object({
  user: mobileProfileUserSchema,
  linkedEmployee: mobileProfileLinkedEmployeeSchema,
});

export const mobileProfilePhoneUpdateBodySchema = z.object({
  phone: optionalUsPhoneSchema,
  expectedVersion: z.number().int().nonnegative().optional(),
});

export const mobileProfilePhoneUpdateResponseSchema = z.object({
  linkedEmployee: mobileProfileLinkedEmployeeSchema,
});

export const mobileProfileMfaStatusUpdateBodySchema = z.object({
  enabled: z.boolean(),
});

export const mobileProfileMfaStatusUpdateResponseSchema = z.object({
  user: mobileProfileUserSchema,
});

export const mobileProfileChangeRequestTypeSchema = z.enum(["profile_update", "account_deletion"]);

export const mobileProfileChangeRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const mobileProfileRequestedChangesSchema = z
  .object({
    firstName: staffNameSchema.optional(),
    lastName: staffNameSchema.optional(),
    employmentType: z.enum(["full_time", "part_time"]).optional(),
    certificationId: z.number().int().nullable().optional(),
    focusAreaIds: z.array(z.number().int()).min(1).optional(),
    roleIds: z.array(z.number().int()).optional(),
    departmentIds: z.array(z.number().int()).optional(),
  })
  .strict();

export const mobileProfileChangeRequestSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  requesterUserId: z.string().uuid().nullable(),
  requesterEmployeeId: z.string().uuid().nullable(),
  requesterName: z.string(),
  requesterEmail: z.string().nullable(),
  type: mobileProfileChangeRequestTypeSchema,
  status: mobileProfileChangeRequestStatusSchema,
  requestedChanges: mobileProfileRequestedChangesSchema,
  currentValues: z.record(z.unknown()),
  requestNote: z.string(),
  resolverUserId: z.string().uuid().nullable(),
  resolverNote: z.string(),
  resolvedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative(),
});

export const mobileProfileChangeRequestsResponseSchema = z.object({
  requests: z.array(mobileProfileChangeRequestSchema),
});

export const mobileProfileChangeRequestCreateBodySchema = z
  .object({
    type: mobileProfileChangeRequestTypeSchema,
    requestedChanges: mobileProfileRequestedChangesSchema.optional(),
    requestNote: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "profile_update" && Object.keys(value.requestedChanges ?? {}).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Profile update requests must include at least one change",
        path: ["requestedChanges"],
      });
    }
  });

export const mobileProfileChangeRequestCreateResponseSchema = z.object({
  request: mobileProfileChangeRequestSchema,
});

export const mobileProfileChangeRequestActionBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({
    action: z.literal("approve"),
    resolverNote: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    resolverNote: z.string().trim().max(1000).optional(),
  }),
]);

export const mobileProfileChangeRequestActionResponseSchema = z.object({
  success: z.literal(true),
  request: mobileProfileChangeRequestSchema,
});

export const mobileNotificationCategorySchema = z.enum(["schedule", "shift_requests", "system"]);

export const mobileNotificationPreferenceChannelsSchema = z.object({
  in_app: z.boolean(),
  email: z.boolean(),
});

export const mobileNotificationPreferencesSchema = z.object({
  schedule: mobileNotificationPreferenceChannelsSchema,
  shift_requests: mobileNotificationPreferenceChannelsSchema,
  system: mobileNotificationPreferenceChannelsSchema,
});

export const mobileNotificationPreferencesResponseSchema = z.object({
  prefs: mobileNotificationPreferencesSchema,
});

export const mobileNotificationPreferencesUpdateBodySchema = z.object({
  prefs: mobileNotificationPreferencesSchema,
});

export const mobileProfileSessionSchema = z.object({
  id: z.string().uuid(),
  platform: z.enum(["web", "ios", "android"]).nullable(),
  appVersion: z.string().nullable(),
  deviceLabel: z.string().nullable(),
  ipAddress: z.string().nullable(),
  lastActiveAt: z.string(),
  createdAt: z.string(),
  refreshTokenHash: z.string().min(1),
  isCurrent: z.boolean(),
});

export const mobileProfileSessionsResponseSchema = z.object({
  active: z.array(mobileProfileSessionSchema),
  stale: z.array(mobileProfileSessionSchema),
});

export const mobileProfileSessionRevokeBodySchema = z.object({
  refreshTokenHash: z.string().min(1),
});

export const mobileProfileSessionRevokeResponseSchema = z.object({
  success: z.literal(true),
});

export const MAX_MOBILE_SCHEDULE_RANGE_DAYS = 31;
const MS_PER_DAY = 86_400_000;

function parseMobileIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function countInclusiveMobileRangeDays(startDate: string, endDate: string): number {
  return (
    Math.floor(
      (parseMobileIsoDate(endDate).getTime() - parseMobileIsoDate(startDate).getTime()) /
        MS_PER_DAY,
    ) + 1
  );
}

export const mobileScheduleQuerySchema = z
  .object({
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
  })
  .superRefine((query, ctx) => {
    if (!query.startDate || !query.endDate) {
      return;
    }

    const dayCount = countInclusiveMobileRangeDays(query.startDate, query.endDate);
    if (dayCount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startDate must be on or before endDate",
        path: ["endDate"],
      });
      return;
    }

    if (dayCount > MAX_MOBILE_SCHEDULE_RANGE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Date range cannot exceed ${MAX_MOBILE_SCHEDULE_RANGE_DAYS} days`,
        path: ["endDate"],
      });
    }
  });

export type MobileScheduleQuery = z.infer<typeof mobileScheduleQuerySchema>;

export function normalizeMobileScheduleRange(input?: MobileScheduleQuery): {
  startDate: string;
  endDate: string;
} {
  const today = new Date();
  const start = input?.startDate
    ? parseMobileIsoDate(input.startDate)
    : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const end = input?.endDate
    ? parseMobileIsoDate(input.endDate)
    : new Date(start.getTime() + 13 * MS_PER_DAY);
  const range = {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
  const dayCount = countInclusiveMobileRangeDays(range.startDate, range.endDate);

  if (dayCount <= 0) {
    throw new RangeError("startDate must be on or before endDate");
  }
  if (dayCount > MAX_MOBILE_SCHEDULE_RANGE_DAYS) {
    throw new RangeError(`Date range cannot exceed ${MAX_MOBILE_SCHEDULE_RANGE_DAYS} days`);
  }

  return range;
}

export const mobileScheduleEntrySegmentSchema = resolvedSchedulePresentationSegmentSchema;

export const mobileScheduleEntrySchema = z.object({
  employeeId: z.string().uuid(),
  employeeName: z.string(),
  employeeSeniority: z.number().int().nullable().optional(),
  employeeFocusAreaIds: z.array(z.number().int()).default([]),
  date: z.string().date(),
  state: scheduleCellStateSchema,
  presentation: resolvedSchedulePresentationSchema,
  publishedAt: z.string().nullable(),
  publishedByName: z.string().nullable(),
});

export const mobileMeScheduleResponseSchema = z.object({
  employee: mobileLinkedEmployeeSchema,
  range: z.object({
    startDate: z.string().date(),
    endDate: z.string().date(),
  }),
  entries: z.array(mobileScheduleEntrySchema),
});

export const mobileOrgScheduleResponseSchema = z.object({
  range: z.object({
    startDate: z.string().date(),
    endDate: z.string().date(),
  }),
  entries: z.array(mobileScheduleEntrySchema),
});

export const mobileShiftSwapOptionsQuerySchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  requesterEmpId: z.string().uuid(),
  requesterShiftDate: z.string().date(),
});

export const mobileShiftSwapOptionsResponseSchema = z.object({
  range: z.object({
    startDate: z.string().date(),
    endDate: z.string().date(),
  }),
  entries: z.array(mobileScheduleEntrySchema),
});

export const mobileShiftRequestSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  type: mobileShiftRequestTypeSchema,
  status: mobileShiftRequestStatusSchema,
  requesterEmpId: z.string().uuid(),
  requesterName: z.string(),
  requesterShiftDate: z.string().date(),
  requesterState: scheduleCellStateSchema,
  requesterPresentation: resolvedSchedulePresentationSchema,
  targetEmpId: z.string().uuid().nullable(),
  targetName: z.string().nullable(),
  targetShiftDate: z.string().date().nullable(),
  targetState: scheduleCellStateSchema.nullable().optional(),
  targetPresentation: resolvedSchedulePresentationSchema.nullable().optional(),
  absenceTypeId: z.number().int().nullable(),
  parentRequestId: z.string().uuid().nullable(),
  adminUserId: z.string().uuid().nullable(),
  adminNote: z.string().nullable(),
  expiresAt: z.string(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Same thresholds as web's computeOpenShifts (apps/web/src/lib/
// dashboard-stats.ts, via @dubgrid/schedule-core's classifyOpenShiftUrgency):
// "high" -> today/tomorrow, "medium" -> within 3 days, else "low". Nullable/
// defaulted so this stays additive against an older shipped mobile client
// during a staged rollout.
export const mobileOpenShiftUrgencySchema = z.enum(["high", "medium", "low"]);

export const mobileOpenShiftSchema = z.object({
  id: z.string(),
  date: z.string().date(),
  focusAreaId: z.number().int(),
  focusAreaName: z.string().nullable(),
  needed: z.number().int().positive(),
  urgency: mobileOpenShiftUrgencySchema.nullable().default(null),
  state: scheduleCellStateSchema,
  presentation: resolvedSchedulePresentationSchema,
  canVolunteer: z.boolean().default(true),
  volunteerBlockReason: z.string().nullable().default(null),
});

export const mobileShiftRequestsResponseSchema = z.object({
  requests: z.array(mobileShiftRequestSchema),
  openShifts: z.array(mobileOpenShiftSchema).default([]),
});

// ── Admin/super_admin dashboard (mobile home view) ──────────────────────────
// Deliberately leaner than web's SuperAdminDashboard/AdminDashboard: coverage
// is summarized as open-slot counts per section rather than a full
// required-vs-filled daily grid, and activity is publish events only (no
// shift-request/invitation events yet). See dashboard-stats.ts on web for the
// full reference implementation this is a scoped-down mobile port of.

export const mobileDashboardCoverageSectionSchema = z.object({
  focusAreaId: z.number().int(),
  focusAreaName: z.string(),
  requiredTotal: z.number().int(),
  filledTotal: z.number().int(),
  pct: z.number().int(),
  openSlots: z.number().int(),
});

// Same 4 event types as web's dashboard activity feed (apps/web/src/lib/
// dashboard-stats.ts's buildActivityFeed) — powers the mobile expanded
// activity screen's type filter.
export const mobileDashboardActivityTypeSchema = z.enum([
  "publish",
  "shift_change",
  "request",
  "user_signup",
]);

export const mobileDashboardActivityItemSchema = z.object({
  id: z.string(),
  type: mobileDashboardActivityTypeSchema,
  description: z.string(),
  timestamp: z.string(),
});

export const mobileDashboardStaffHoursEntrySchema = z.object({
  employeeId: z.string().uuid(),
  employeeName: z.string(),
  totalHours: z.number(),
  overtimeHours: z.number(),
  // The focus area the employee logged the most hours in this period —
  // powers the mobile expanded "Overtime watch" screen's focus-area filter,
  // matching web's ExpandedStaffHours.tsx.
  focusAreaId: z.number().int().nullable().default(null),
  focusAreaName: z.string().nullable().default(null),
});

// Simplified port of web's DashboardHero: a headline/description summary plus
// a handful of top-line metrics. Coverage % is derived from coverage_requirements
// vs. open-shift gaps (day-of-week matched, no coverage-rule-config credit
// resolution) — a reasonable approximation, not the exact engine computation
// web's schedule-logic.ts uses. There is no "draft shifts" metric yet: that
// needs draft-vs-published schedule diffing, which mobile doesn't fetch.
export const mobileDashboardHeroSummarySchema = z.object({
  statusLabel: z.string(),
  title: z.string(),
  description: z.string(),
});

export const mobileDashboardMetricsSchema = z.object({
  coveragePct: z.number().int().nullable(),
  openGapCount: z.number().int(),
  pendingApprovalsCount: z.number().int(),
});

export const mobileDashboardResponseSchema = z.object({
  range: z.object({
    startDate: z.string().date(),
    endDate: z.string().date(),
  }),
  overtimeThresholdHours: z.number().int().positive(),
  heroSummary: mobileDashboardHeroSummarySchema,
  metrics: mobileDashboardMetricsSchema,
  coverageBySection: z.array(mobileDashboardCoverageSectionSchema),
  openShifts: z.array(mobileOpenShiftSchema),
  activity: z.array(mobileDashboardActivityItemSchema),
  staffHours: z.array(mobileDashboardStaffHoursEntrySchema),
  actionQueue: z.array(mobileShiftRequestSchema),
});

export const mobileCreateShiftRequestBodySchema = z
  .object({
    type: mobileShiftRequestTypeSchema,
    requesterEmpId: z.string().uuid(),
    requesterShiftDate: z.string().date(),
    requesterSegmentIndex: z.number().int().nonnegative().optional(),
    targetEmpId: z.string().uuid().optional(),
    targetShiftDate: z.string().date().optional(),
    targetSegmentIndex: z.number().int().nonnegative().optional(),
    absenceTypeId: z.number().int().optional(),
  })
  .superRefine((value, ctx) => {
    const isTargetedPickup = value.type === "pickup" && value.targetEmpId && value.targetShiftDate;
    const hasTargetedPickupField =
      value.type === "pickup" &&
      (value.targetEmpId != null || value.targetShiftDate != null || value.absenceTypeId != null);

    if (value.absenceTypeId != null && value.type !== "calloff" && value.type !== "pickup") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only calloff and targeted pickup requests can include an absence type",
        path: ["absenceTypeId"],
      });
    }

    if (hasTargetedPickupField && !isTargetedPickup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Targeted pickup requests require a target employee, target shift date, and absence type",
        path: ["targetEmpId"],
      });
    }

    if (isTargetedPickup && value.absenceTypeId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Targeted pickup requests require an absence type",
        path: ["absenceTypeId"],
      });
    }

    if (isTargetedPickup && value.targetShiftDate !== value.requesterShiftDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Targeted pickup requests must target the requester shift date",
        path: ["targetShiftDate"],
      });
    }
  });

export const mobileCreateShiftRequestResponseSchema = z.object({
  requestId: z.string().uuid(),
});

export const mobileUpdateShiftRequestBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("claim"),
    claimerEmpId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("respond"),
    empId: z.string().uuid(),
    accept: z.boolean(),
  }),
  z.object({
    action: z.literal("resolve"),
    approved: z.boolean(),
    note: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("cancel"),
    empId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("volunteer_open_shift"),
    empId: z.string().uuid(),
    shiftDate: z.string().date(),
    focusAreaId: z.number().int(),
    state: scheduleCellStateSchema,
  }),
]);

export const mobileUpdateShiftRequestResponseSchema = z.object({
  success: z.literal(true),
});

export const mobilePersonSchema = z.object({
  id: z.string().uuid(),
  employeeNumber: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  employmentType: z.enum(["full_time", "part_time"]).default("full_time"),
  phone: z.string(),
  email: z.string(),
  status: z.enum(["active", "inactive", "removed"]),
  orgRole: z.enum(["super_admin", "admin", "user"]).nullable().default(null),
  certificationId: z.number().int().nullable().default(null),
  roleIds: z.array(z.number().int()).default([]),
  seniority: z.number().int().default(0),
  focusAreaIds: z.array(z.number().int()),
  departmentIds: z.array(z.number().int()).default([]),
  deptAdminIds: z.array(z.number().int()).default([]),
  managementDepartmentIds: z.array(z.number().int()).default([]),
  managementDeptAdminIds: z.array(z.number().int()).default([]),
  contactNotes: z.string().default(""),
  statusChangedAt: z.string().nullable().default(null),
  statusNote: z.string().default(""),
  userId: z.string().uuid().nullable().default(null),
  version: z.number().int().nonnegative().default(0),
  /**
   * The linked membership row's `updated_at`, for optimistic concurrency on the
   * management-access write path. `version` covers the employees row only, and
   * management access lives on the membership, so the two need separate guards.
   */
  membershipUpdatedAt: z.string().nullable().default(null),
  pendingInvitation: z
    .object({
      id: z.string().uuid(),
      email: z.string().email(),
      expiresAt: z.string(),
      updatedAt: z.string().nullable(),
      /** The org role this invite grants once accepted. */
      roleToAssign: mobileRoleSchema.nullable().default(null),
    })
    .nullable()
    .default(null),
});

export const mobilePeopleResponseSchema = z.object({
  people: z.array(mobilePersonSchema),
});

export const mobilePersonResponseSchema = z.object({
  person: mobilePersonSchema,
});

export const mobilePersonUpdateBodySchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  firstName: staffNameSchema,
  lastName: staffNameSchema,
  phone: optionalUsPhoneSchema,
  email: optionalStaffEmailSchema,
  contactNotes: staffNotesSchema,
  employmentType: z.enum(["full_time", "part_time"]).optional(),
  certificationId: z.number().int().nullable(),
  focusAreaIds: z.array(z.number().int()).min(1),
  roleIds: z.array(z.number().int()),
  departmentIds: z.array(z.number().int()),
});

export const mobilePersonUpdateResponseSchema = z.object({
  success: z.literal(true),
  person: mobilePersonSchema,
});

export const mobilePersonCreateBodySchema = z.object({
  firstName: staffNameSchema,
  lastName: staffNameSchema,
  employmentType: z.enum(["full_time", "part_time"]).default("full_time"),
  certificationId: z.number().int().nullable(),
  focusAreaIds: z.array(z.number().int()).min(1),
  email: optionalStaffEmailSchema,
});

export const mobilePersonCreateResponseSchema = z.object({
  success: z.literal(true),
  person: mobilePersonSchema,
});

export const mobileBillingAccessStateSchema = z.enum([
  "active",
  "trial_pending",
  "trialing",
  "trial_ending_soon",
  "trial_grace",
  "payment_attention_required",
  "locked",
  "suspended",
]);

export const mobileOrgStatusResponseSchema = z.object({
  state: mobileBillingAccessStateSchema,
  isLocked: z.boolean(),
  trialGraceEndsAt: z.string().nullable(),
  orgRole: mobileRoleSchema,
});

export const mobilePersonStatusUpdateBodySchema = z.object({
  action: z.enum(["deactivate", "activate", "remove"]),
  expectedVersion: z.number().int().nonnegative(),
  note: z.string().trim().max(500).optional(),
});

export const mobilePersonStatusUpdateResponseSchema = z.object({
  success: z.literal(true),
  person: mobilePersonSchema,
});

export const mobilePersonInvitationCreateBodySchema = z.object({
  email: z.string().trim().email(),
  linkExistingAccount: z.boolean().optional(),
  reconcileName: z.boolean().optional(),
});

export const mobilePersonInvitationActionBodySchema = z.object({
  invitationId: z.string().uuid(),
  expectedUpdatedAt: z.string().nullable(),
});

export const mobilePersonInvitationResponseSchema = z.object({
  success: z.literal(true),
  result: z
    .enum(["invitation_sent", "invitation_resent", "invitation_revoked", "account_linked"])
    .optional(),
  person: mobilePersonSchema,
});

/**
 * Management access for someone who already has a staff profile. Which branch
 * the server takes is decided server-side by whether the staff row is linked to
 * an account: a linked person gets their membership updated, an unlinked one
 * gets an invitation carrying the role and departments.
 */
export const mobileManagementAccessBodySchema = z.object({
  orgRole: mobileRoleSchema,
  managementDepartmentIds: z.array(z.number().int()).min(1),
  /** Only read on the invitation branch; a linked account uses its own email. */
  email: z.string().trim().email().optional(),
  expectedMembershipUpdatedAt: z.string().nullable().default(null),
  expectedInvitationUpdatedAt: z.string().nullable().default(null),
});

export const mobileManagementAccessRemoveBodySchema = z.object({
  expectedMembershipUpdatedAt: z.string().nullable().default(null),
  expectedInvitationUpdatedAt: z.string().nullable().default(null),
});

export const mobileManagementAccessResponseSchema = z.object({
  success: z.literal(true),
  result: z.enum(["membership_updated", "invitation_sent", "access_removed"]),
  person: mobilePersonSchema,
});

/**
 * Someone on the management roster. Deliberately not a `MobilePerson`: a
 * management user may have no staff profile at all (and a pending one has no
 * account either), so there is no employee UUID to key them by. `id` is a
 * composite the server understands — `u:<userId>` for a member, `inv:<id>` for
 * a pending invitation — mirroring the directory RPC's own person_id.
 */
export const mobileManagementUserSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["member", "pending_invite"]),
  userId: z.string().uuid().nullable().default(null),
  /** Set when they also have a staff profile, so the app can link across. */
  employeeId: z.string().uuid().nullable().default(null),
  employeeStatus: z.enum(["active", "inactive", "removed"]).nullable().default(null),
  firstName: z.string().default(""),
  lastName: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
  orgRole: mobileRoleSchema.nullable().default(null),
  managementDepartmentIds: z.array(z.number().int()).default([]),
  managementDeptAdminIds: z.array(z.number().int()).default([]),
  /** Optimistic-concurrency guard for whichever row backs this person. */
  updatedAt: z.string().nullable().default(null),
  invitationId: z.string().uuid().nullable().default(null),
  invitationExpiresAt: z.string().nullable().default(null),
});

export const mobileManagementUsersResponseSchema = z.object({
  managementUsers: z.array(mobileManagementUserSchema),
});

export const mobileManagementUserUpdateBodySchema = z.object({
  orgRole: mobileRoleSchema,
  managementDepartmentIds: z.array(z.number().int()).min(1),
  expectedUpdatedAt: z.string().nullable().default(null),
});

export const mobileManagementUserRemoveBodySchema = z.object({
  expectedUpdatedAt: z.string().nullable().default(null),
});

/** Invite someone straight into management, with no staff profile behind it. */
export const mobileManagementUserInviteBodySchema = z.object({
  email: z.string().trim().email(),
  firstName: staffNameSchema,
  lastName: staffNameSchema,
  phone: optionalUsPhoneSchema.default(""),
  orgRole: mobileRoleSchema,
  managementDepartmentIds: z.array(z.number().int()).min(1),
});

export const mobileManagementUserInvitationActionBodySchema = z.object({
  action: z.enum(["resend", "revoke"]),
  expectedUpdatedAt: z.string().nullable().default(null),
});

export const mobileManagementUserResponseSchema = z.object({
  success: z.literal(true),
  result: z.enum([
    "membership_updated",
    "invitation_sent",
    "invitation_resent",
    "invitation_revoked",
    "access_removed",
  ]),
  managementUser: mobileManagementUserSchema.nullable().default(null),
});

export const mobileNotificationPrioritySchema = z.enum(["low", "normal", "high", "critical"]);

export const mobileNotificationSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    "impersonation_start",
    "impersonation_end",
    "system",
    "shift_change",
    "schedule_published",
    "shift_request_new",
    "shift_request_approved",
    "shift_request_rejected",
    "shift_request_expired",
    // schedule (non-publish flows)
    "recurring_shift_updated",
    "shift_series_updated",
    "schedule_note_published",
    "recurring_schedules_applied",
    // membership lifecycle
    "invitation_received",
    "invitation_accepted",
    "invitation_revoked",
    "invitation_resent",
    "invitation_expired",
    "membership_removed",
    "admin_permissions_changed",
    "member_dept_changed",
    // employee + org account
    "employee_created",
    "employee_status_changed",
    "employee_profile_changed",
    "org_settings_changed",
    "org_suspended",
    "org_unsuspended",
    // billing
    "billing_subscription_changed",
    "billing_payment_failed",
    "billing_payment_succeeded",
    "billing_trial_ending_soon",
    "billing_trial_expired",
    // security
    "security_email_changed",
    "security_password_changed",
    "security_mfa_changed",
    "security_new_device",
    "security_session_revoked",
    // platform / gridmaster (org lifecycle events, org_id = NULL; mobile has
    // no gridmaster role today, kept for schema parity with web)
    "org_created",
    "org_trial_started",
    "org_archived",
    "org_restored",
    "org_subscription_converted",
    "org_subscription_canceled",
    "org_payment_failed",
  ]),
  channel: z.enum(["in_app", "email"]),
  category: z.string().nullable(),
  priority: mobileNotificationPrioritySchema,
  title: z.string(),
  message: z.string(),
  metadata: z.record(z.unknown()),
  readAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const mobileNotificationsCursorSchema = z.object({
  createdAt: z.string(),
  id: z.string().uuid(),
});

export const mobileNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursorCreatedAt: z.string().optional(),
  cursorId: z.string().uuid().optional(),
  category: z.string().min(1).max(64).optional(),
  type: z.string().min(1).max(64).optional(),
  priority: mobileNotificationPrioritySchema.optional(),
  read: z.enum(["read", "unread"]).optional(),
  search: z.string().min(1).max(200).optional(),
  archived: z.enum(["inbox", "archived", "any"]).optional(),
  sort: z.enum(["asc", "desc"]).optional(),
});

export const mobileNotificationsResponseSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
  notifications: z.array(mobileNotificationSchema),
  nextCursor: mobileNotificationsCursorSchema.nullable(),
});

export const mobileNotificationReadResponseSchema = z.object({
  success: z.literal(true),
  unreadCount: z.number().int().nonnegative(),
});

export const mobileNotificationBulkActionSchema = z.enum([
  "read",
  "unread",
  "archive",
  "unarchive",
]);

export const mobileNotificationBulkBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: mobileNotificationBulkActionSchema,
});

export const mobileNotificationBulkResponseSchema = z.object({
  success: z.literal(true),
  unreadCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
});

export const mobileNotificationFacetsSchema = z.object({
  totalInbox: z.number().int().nonnegative(),
  totalUnread: z.number().int().nonnegative(),
  totalArchived: z.number().int().nonnegative(),
  byCategory: z.record(z.string(), z.number().int().nonnegative()),
  byPriority: z.record(z.string(), z.number().int().nonnegative()),
});

export const mobilePushTokenBodySchema = z.object({
  platform: mobilePlatformSchema,
  expoPushToken: z.string().min(8),
  disabled: z.boolean().optional(),
});

export const mobilePushTokenResponseSchema = z.object({
  success: z.literal(true),
});

export type MobileBootstrapResponse = z.infer<typeof mobileBootstrapResponseSchema>;
export type MobileTermsAcceptanceResponse = z.infer<typeof mobileTermsAcceptanceResponseSchema>;
export type MobileProfileResponse = z.infer<typeof mobileProfileResponseSchema>;
export type MobileProfileAccountUpdateBody = z.infer<typeof mobileProfileAccountUpdateBodySchema>;
export type MobileProfilePhoneUpdateBody = z.infer<typeof mobileProfilePhoneUpdateBodySchema>;
export type MobileProfileMfaStatusUpdateBody = z.infer<
  typeof mobileProfileMfaStatusUpdateBodySchema
>;
export type MobilePersonCreateBody = z.infer<typeof mobilePersonCreateBodySchema>;
export type MobileOrgStatusResponse = z.infer<typeof mobileOrgStatusResponseSchema>;
export type MobileProfileChangeRequest = z.infer<typeof mobileProfileChangeRequestSchema>;
export type MobileProfileChangeRequestCreateBody = z.infer<
  typeof mobileProfileChangeRequestCreateBodySchema
>;
export type MobileProfileChangeRequestActionBody = z.infer<
  typeof mobileProfileChangeRequestActionBodySchema
>;
export type MobileNotificationPreferences = z.infer<typeof mobileNotificationPreferencesSchema>;
export type MobileProfileSession = z.infer<typeof mobileProfileSessionSchema>;
export type MobileAuthSession = z.infer<typeof mobileAuthSessionSchema>;
export type MobileAuthLoginResponse = z.infer<typeof mobileAuthLoginResponseSchema>;
export type MobileAuthLoginBody = z.infer<typeof mobileAuthLoginBodySchema>;
export type MobileAbsenceType = z.infer<typeof mobileAbsenceTypeSchema>;
export type MobileFocusArea = z.infer<typeof mobileFocusAreaSchema>;
export type MobileNamedItem = z.infer<typeof mobileNamedItemSchema>;
export type MobileDepartment = z.infer<typeof mobileDepartmentSchema>;
export type MobileScheduleRange = z.infer<typeof mobileMeScheduleResponseSchema>["range"];
export type MobileScheduleEntrySegment = z.infer<typeof mobileScheduleEntrySegmentSchema>;
export type MobileScheduleEntry = z.infer<typeof mobileScheduleEntrySchema>;
export type MobileShiftRequest = z.infer<typeof mobileShiftRequestSchema>;
export type MobileOpenShift = z.infer<typeof mobileOpenShiftSchema>;
export type MobileDashboardResponse = z.infer<typeof mobileDashboardResponseSchema>;
export type MobileNotification = z.infer<typeof mobileNotificationSchema>;
export type MobileNotificationPriority = z.infer<typeof mobileNotificationPrioritySchema>;
export type MobileNotificationsQuery = z.infer<typeof mobileNotificationsQuerySchema>;
export type MobileNotificationsCursor = z.infer<typeof mobileNotificationsCursorSchema>;
export type MobileNotificationsResponse = z.infer<typeof mobileNotificationsResponseSchema>;
export type MobileNotificationBulkAction = z.infer<typeof mobileNotificationBulkActionSchema>;
export type MobileNotificationBulkBody = z.infer<typeof mobileNotificationBulkBodySchema>;
export type MobileNotificationBulkResponse = z.infer<typeof mobileNotificationBulkResponseSchema>;
export type MobileNotificationFacets = z.infer<typeof mobileNotificationFacetsSchema>;
export type MobilePerson = z.infer<typeof mobilePersonSchema>;
export type MobilePersonUpdateBody = z.infer<typeof mobilePersonUpdateBodySchema>;
export type MobileCreateShiftRequestBody = z.infer<typeof mobileCreateShiftRequestBodySchema>;
export type MobileUpdateShiftRequestBody = z.infer<typeof mobileUpdateShiftRequestBodySchema>;
export type MobilePersonStatusUpdateBody = z.infer<typeof mobilePersonStatusUpdateBodySchema>;
export type MobilePersonInvitationCreateBody = z.infer<
  typeof mobilePersonInvitationCreateBodySchema
>;
export type MobilePersonInvitationActionBody = z.infer<
  typeof mobilePersonInvitationActionBodySchema
>;
export type MobileManagementAccessBody = z.infer<typeof mobileManagementAccessBodySchema>;
export type MobileManagementAccessRemoveBody = z.infer<
  typeof mobileManagementAccessRemoveBodySchema
>;
export type MobileManagementAccessResponse = z.infer<typeof mobileManagementAccessResponseSchema>;
export type MobileManagementUser = z.infer<typeof mobileManagementUserSchema>;
export type MobileManagementUsersResponse = z.infer<typeof mobileManagementUsersResponseSchema>;
export type MobileManagementUserUpdateBody = z.infer<typeof mobileManagementUserUpdateBodySchema>;
export type MobileManagementUserRemoveBody = z.infer<typeof mobileManagementUserRemoveBodySchema>;
export type MobileManagementUserInviteBody = z.infer<typeof mobileManagementUserInviteBodySchema>;
export type MobileManagementUserInvitationActionBody = z.infer<
  typeof mobileManagementUserInvitationActionBodySchema
>;
export type MobileManagementUserResponse = z.infer<typeof mobileManagementUserResponseSchema>;
