import { z } from "zod";
import {
  resolvedSchedulePresentationSchema,
  resolvedSchedulePresentationSegmentSchema,
  scheduleCellStateSchema,
} from "./schedule";

export const mobilePlatformSchema = z.enum(["ios", "android"]);
export const mobileRoleSchema = z.enum(["super_admin", "admin", "user"]);
export const mobileWorkspaceSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
export const mobileShiftRequestTypeSchema = z.enum([
  "pickup",
  "swap",
  "calloff",
]);
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

export const mobileWorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: mobileWorkspaceSlugSchema,
});

export const mobileWorkspaceLookupResponseSchema = z.object({
  workspace: mobileWorkspaceSchema,
});

export const mobileAuthSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  tokenType: z.string().min(1),
});

export const mobileAuthLoginBodySchema = z.object({
  workspaceSlug: mobileWorkspaceSlugSchema,
  email: z.string().email(),
  password: z.string().min(1),
});

export const mobileAuthLoginResponseSchema = z.object({
  session: mobileAuthSessionSchema,
  workspace: mobileWorkspaceSchema,
  user: mobileUserSchema,
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
});

export const mobileOrgConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string().nullable(),
  timezone: z.string().nullable(),
  shiftDisplayMode: z.enum(["code", "name"]),
  labels: z.object({
    focusArea: z.string(),
    certification: z.string(),
    role: z.string(),
    department: z.string(),
  }),
  featureFlags: z.record(z.boolean()),
});

export const mobileLinkedEmployeeSchema = z
  .object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    status: z.enum(["active", "benched", "terminated"]),
    focusAreaIds: z.array(z.number().int()).default([]),
  })
  .nullable();

export const mobileAbsenceTypeSchema = z.object({
  id: z.number().int(),
  label: z.string(),
});

export const mobileFocusAreaSchema = z.object({
  id: z.number().int(),
  name: z.string(),
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
  unreadNotificationCount: z.number().int().nonnegative(),
});

export const mobileScheduleQuerySchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export const mobileScheduleEntrySegmentSchema =
  resolvedSchedulePresentationSegmentSchema;

export const mobileScheduleEntrySchema = z.object({
  employeeId: z.string().uuid(),
  employeeName: z.string(),
  employeeSeniority: z.number().int().nullable().optional(),
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

export const mobileOpenShiftSchema = z.object({
  id: z.string(),
  date: z.string().date(),
  focusAreaId: z.number().int(),
  focusAreaName: z.string().nullable(),
  needed: z.number().int().positive(),
  state: scheduleCellStateSchema,
  presentation: resolvedSchedulePresentationSchema,
});

export const mobileShiftRequestsResponseSchema = z.object({
  requests: z.array(mobileShiftRequestSchema),
  openShifts: z.array(mobileOpenShiftSchema).default([]),
});

export const mobileCreateShiftRequestBodySchema = z.object({
  type: mobileShiftRequestTypeSchema,
  requesterEmpId: z.string().uuid(),
  requesterShiftDate: z.string().date(),
  targetEmpId: z.string().uuid().optional(),
  targetShiftDate: z.string().date().optional(),
  absenceTypeId: z.number().int().optional(),
});

export const mobileCreateShiftRequestResponseSchema = z.object({
  requestId: z.string().uuid(),
});

export const mobileUpdateShiftRequestBodySchema = z.discriminatedUnion(
  "action",
  [
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
  ],
);

export const mobileUpdateShiftRequestResponseSchema = z.object({
  success: z.literal(true),
});

export const mobilePersonSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  email: z.string(),
  status: z.enum(["active", "benched", "terminated"]),
  focusAreaIds: z.array(z.number().int()),
  contactNotes: z.string().default(""),
  statusChangedAt: z.string().nullable().default(null),
  statusNote: z.string().default(""),
  version: z.number().int().nonnegative().default(0),
});

export const mobilePeopleResponseSchema = z.object({
  people: z.array(mobilePersonSchema),
});

export const mobilePersonStatusUpdateBodySchema = z.object({
  action: z.enum(["bench", "activate"]),
  expectedVersion: z.number().int().nonnegative(),
  note: z.string().trim().max(500).optional(),
});

export const mobilePersonStatusUpdateResponseSchema = z.object({
  success: z.literal(true),
  person: mobilePersonSchema,
});

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
  ]),
  channel: z.enum(["in_app", "email"]),
  category: z.string().nullable(),
  title: z.string(),
  message: z.string(),
  metadata: z.record(z.unknown()),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const mobileNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export const mobileNotificationsResponseSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
  notifications: z.array(mobileNotificationSchema),
});

export const mobileNotificationReadResponseSchema = z.object({
  success: z.literal(true),
  unreadCount: z.number().int().nonnegative(),
});

export const mobilePushTokenBodySchema = z.object({
  platform: mobilePlatformSchema,
  expoPushToken: z.string().min(8),
  disabled: z.boolean().optional(),
});

export const mobilePushTokenResponseSchema = z.object({
  success: z.literal(true),
});

export type MobileBootstrapResponse = z.infer<
  typeof mobileBootstrapResponseSchema
>;
export type MobileAuthLoginResponse = z.infer<
  typeof mobileAuthLoginResponseSchema
>;
export type MobileAbsenceType = z.infer<typeof mobileAbsenceTypeSchema>;
export type MobileFocusArea = z.infer<typeof mobileFocusAreaSchema>;
export type MobileScheduleRange = z.infer<
  typeof mobileMeScheduleResponseSchema
>["range"];
export type MobileScheduleEntrySegment = z.infer<
  typeof mobileScheduleEntrySegmentSchema
>;
export type MobileScheduleEntry = z.infer<typeof mobileScheduleEntrySchema>;
export type MobileShiftRequest = z.infer<typeof mobileShiftRequestSchema>;
export type MobileOpenShift = z.infer<typeof mobileOpenShiftSchema>;
export type MobileNotification = z.infer<typeof mobileNotificationSchema>;
export type MobilePerson = z.infer<typeof mobilePersonSchema>;
export type MobileCreateShiftRequestBody = z.infer<
  typeof mobileCreateShiftRequestBodySchema
>;
export type MobileUpdateShiftRequestBody = z.infer<
  typeof mobileUpdateShiftRequestBodySchema
>;
export type MobilePersonStatusUpdateBody = z.infer<
  typeof mobilePersonStatusUpdateBodySchema
>;
