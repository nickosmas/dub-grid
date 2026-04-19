import { describe, expect, it } from "vitest";
import {
  mobileAuthLoginResponseSchema,
  mobileBootstrapResponseSchema,
  mobileNotificationReadResponseSchema,
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
        canViewShiftCodes: false,
        canManageShiftCodes: false,
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
        canViewShiftCodes: false,
        canManageShiftCodes: false,
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
        canViewShiftCodes: false,
        canManageShiftCodes: false,
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

  it("rejects invalid shift-request update payloads", () => {
    const result = mobileUpdateShiftRequestBodySchema.safeParse({
      action: "resolve",
      approved: "yes",
    });

    expect(result.success).toBe(false);
  });
});
