import { describe, expect, it } from "vitest";
import {
  mobileAuthLoginResponseSchema,
  mobileBootstrapResponseSchema,
  mobileScheduleEntrySchema,
  mobileNotificationReadResponseSchema,
  mobileShiftRequestsResponseSchema,
  mobileShiftRequestSchema,
  mobileUpdateShiftRequestBodySchema,
  mobileWorkspaceLookupResponseSchema,
} from "./mobile";

describe("mobile contracts", () => {
  it("accepts a valid workspace lookup response", () => {
    const result = mobileWorkspaceLookupResponseSchema.safeParse({
      workspace: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Acme Care",
        slug: "acme",
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid mobile auth login response", () => {
    const result = mobileAuthLoginResponseSchema.safeParse({
      session: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresIn: 3600,
        tokenType: "bearer",
      },
      workspace: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Acme Care",
        slug: "acme",
      },
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "alex@example.com",
        firstName: "Alex",
        lastName: "North",
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid bootstrap response", () => {
    const result = mobileBootstrapResponseSchema.safeParse({
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "alex@example.com",
        firstName: "Alex",
        lastName: "North",
      },
      currentOrg: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Acme Care",
        slug: "acme",
        timezone: "America/Los_Angeles",
        shiftDisplayMode: "code",
        labels: {
          focusArea: "Focus Areas",
          certification: "Certifications",
          role: "Roles",
          department: "Departments",
        },
        featureFlags: {
          beta_shift_requests: true,
        },
      },
      memberships: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Acme Care",
          slug: "acme",
          orgRole: "admin",
          platformRole: "none",
          isCurrent: true,
        },
      ],
      effectiveRole: "admin",
      permissions: {
        canViewSchedule: true,
        canEditShifts: false,
        canPublishSchedule: false,
        canApplyRecurringSchedule: false,
        canEditNotes: false,
        canViewRecurringShifts: false,
        canManageRecurringShifts: false,
        canManageShiftSeries: false,
        canViewStaff: true,
        canViewEmployeeDetails: true,
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
        canApproveShiftRequests: true,
        canViewDashboardAnalytics: true,
      },
      linkedEmployee: {
        id: "33333333-3333-4333-8333-333333333333",
        firstName: "Alex",
        lastName: "North",
        status: "active",
        focusAreaIds: [2],
      },
      absenceTypes: [
        {
          id: 1,
          label: "Sick",
        },
      ],
      focusAreas: [
        {
          id: 1,
          name: "Emergency",
        },
        {
          id: 2,
          name: "ICU",
        },
      ],
      unreadNotificationCount: 3,
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid bootstrap response without a linked employee", () => {
    const result = mobileBootstrapResponseSchema.safeParse({
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "alex@example.com",
        firstName: "Alex",
        lastName: "North",
      },
      currentOrg: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Acme Care",
        slug: "acme",
        timezone: "America/Los_Angeles",
        shiftDisplayMode: "code",
        labels: {
          focusArea: "Focus Areas",
          certification: "Certifications",
          role: "Roles",
          department: "Departments",
        },
        featureFlags: {
          beta_shift_requests: true,
        },
      },
      memberships: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Acme Care",
          slug: "acme",
          orgRole: "admin",
          platformRole: "none",
          isCurrent: true,
        },
      ],
      effectiveRole: "admin",
      permissions: {
        canViewSchedule: true,
        canEditShifts: false,
        canPublishSchedule: false,
        canApplyRecurringSchedule: false,
        canEditNotes: false,
        canViewRecurringShifts: false,
        canManageRecurringShifts: false,
        canManageShiftSeries: false,
        canViewStaff: true,
        canViewEmployeeDetails: true,
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
        canApproveShiftRequests: true,
        canViewDashboardAnalytics: true,
      },
      linkedEmployee: null,
      absenceTypes: [
        {
          id: 1,
          label: "Sick",
        },
      ],
      focusAreas: [
        {
          id: 1,
          name: "Emergency",
        },
        {
          id: 2,
          name: "ICU",
        },
      ],
      unreadNotificationCount: 3,
    });

    expect(result.success).toBe(true);
  });

  it("accepts a linked employee without focusAreaIds for backward compatibility", () => {
    const result = mobileBootstrapResponseSchema.safeParse({
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "alex@example.com",
        firstName: "Alex",
        lastName: "North",
      },
      currentOrg: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Acme Care",
        slug: "acme",
        timezone: "America/Los_Angeles",
        shiftDisplayMode: "code",
        labels: {
          focusArea: "Focus Areas",
          certification: "Certifications",
          role: "Roles",
          department: "Departments",
        },
        featureFlags: {
          beta_shift_requests: true,
        },
      },
      memberships: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Acme Care",
          slug: "acme",
          orgRole: "admin",
          platformRole: "none",
          isCurrent: true,
        },
      ],
      effectiveRole: "admin",
      permissions: {
        canViewSchedule: true,
        canEditShifts: false,
        canPublishSchedule: false,
        canApplyRecurringSchedule: false,
        canEditNotes: false,
        canViewRecurringShifts: false,
        canManageRecurringShifts: false,
        canManageShiftSeries: false,
        canViewStaff: true,
        canViewEmployeeDetails: true,
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
        canApproveShiftRequests: true,
        canViewDashboardAnalytics: true,
      },
      linkedEmployee: {
        id: "33333333-3333-4333-8333-333333333333",
        firstName: "Alex",
        lastName: "North",
        status: "active",
      },
      absenceTypes: [
        {
          id: 1,
          label: "Sick",
        },
      ],
      focusAreas: [
        {
          id: 1,
          name: "Emergency",
        },
      ],
      unreadNotificationCount: 3,
    });

    expect(result.success).toBe(true);
    expect(result.data?.linkedEmployee?.focusAreaIds).toEqual([]);
  });

  it("accepts a valid notification read response", () => {
    const result = mobileNotificationReadResponseSchema.safeParse({
      success: true,
      unreadCount: 0,
    });

    expect(result.success).toBe(true);
  });

  it("accepts mobile shift requests with computed open shifts", () => {
    const result = mobileShiftRequestsResponseSchema.safeParse({
      requests: [],
      openShifts: [
        {
          id: "coverage-gap-1",
          date: "2026-04-19",
          focusAreaId: 2,
          focusAreaName: "Skilled Nursing",
          needed: 1,
          state: {
            kind: "worked",
            segments: [{ shiftId: 1, jobId: 20, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          presentation: {
            label: "Day Shift",
            focusAreaId: 2,
            focusAreaName: "Skilled Nursing",
            displayFocusAreaName: "Skilled Nursing",
            startTime: "07:00:00",
            endTime: "15:00:00",
            segments: [
              {
                shiftId: 1,
                jobId: 20,
                shiftName: "Day Shift",
                jobName: "Nurse",
                defaultDurationHours: null,
                defaultDurationMinutes: null,
                breakMinutes: 30,
                startTime: "07:00:00",
                endTime: "15:00:00",
                displayFocusAreaName: "Skilled Nursing",
              },
            ],
          },
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("keeps mobile schedule entries canonical-only", () => {
    const result = mobileScheduleEntrySchema.safeParse({
      employeeId: "33333333-3333-4333-8333-333333333333",
      employeeName: "Alex North",
      date: "2026-04-18",
      state: {
        kind: "worked",
        segments: [{ shiftId: 1, jobId: 10, position: 0 }],
        absenceTypeId: null,
        customStartTime: null,
        customEndTime: null,
        seriesId: null,
        fromRecurring: false,
      },
      presentation: {
        label: "Nurse",
        shiftName: "Day Shift",
        focusAreaId: 2,
        focusAreaName: "ICU",
        displayFocusAreaName: "ICU",
        startTime: "07:00:00",
        endTime: "15:00:00",
        segments: [
          {
            shiftId: 1,
            jobId: 10,
            label: "Nurse",
            shiftName: "Day Shift",
            jobName: "Nurse",
            jobColor: "#ECFEFF",
            jobBorderColor: "#A5F3FC",
            jobTextColor: "#0E7490",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "ICU",
          },
        ],
      },
      shiftIds: [1],
      jobIds: [10],
      assignmentLabel: "D",
      publishedAt: null,
      publishedByName: null,
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("shiftIds");
    expect(result.data).not.toHaveProperty("jobIds");
    expect(result.data).not.toHaveProperty("assignmentLabel");
  });

  it("keeps mobile shift requests canonical-only", () => {
    const result = mobileShiftRequestSchema.safeParse({
      id: "44444444-4444-4444-8444-444444444444",
      orgId: "22222222-2222-4222-8222-222222222222",
      type: "pickup",
      status: "open",
      requesterEmpId: "33333333-3333-4333-8333-333333333333",
      requesterName: "Alex North",
      requesterShiftDate: "2026-04-18",
      requesterState: {
        kind: "worked",
        segments: [{ shiftId: 1, jobId: 10, position: 0 }],
        absenceTypeId: null,
        customStartTime: null,
        customEndTime: null,
        seriesId: null,
        fromRecurring: false,
      },
      requesterPresentation: {
        label: "Nurse",
        shiftName: "Day Shift",
        startTime: "07:00:00",
        endTime: "15:00:00",
        segments: [],
      },
      requesterShiftIds: [1],
      requesterJobIds: [10],
      requesterShiftLabel: "Day Shift",
      targetEmpId: null,
      targetName: null,
      targetShiftDate: null,
      targetState: null,
      targetPresentation: null,
      absenceTypeId: null,
      parentRequestId: null,
      adminUserId: null,
      adminNote: null,
      expiresAt: "2026-04-19T00:00:00.000Z",
      resolvedAt: null,
      createdAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("requesterShiftIds");
    expect(result.data).not.toHaveProperty("requesterJobIds");
    expect(result.data).not.toHaveProperty("requesterShiftLabel");
  });

  it("rejects invalid shift-request update payloads", () => {
    const result = mobileUpdateShiftRequestBodySchema.safeParse({
      action: "resolve",
      approved: "yes",
    });

    expect(result.success).toBe(false);
  });
});
