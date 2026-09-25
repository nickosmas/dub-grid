import { describe, expect, it } from "vitest";
import {
  mobileAuthLoginResponseSchema,
  mobileBootstrapResponseSchema,
  mobileCreateShiftRequestBodySchema,
  mobileDashboardMetricsSchema,
  mobileNotificationPreferencesResponseSchema,
  mobileNotificationSchema,
  mobileOrgStatusResponseSchema,
  mobilePersonSchema,
  mobilePersonResponseSchema,
  mobilePersonUpdateBodySchema,
  mobileProfileAccountUpdateBodySchema,
  mobileProfileChangeRequestCreateBodySchema,
  mobileProfilePhoneUpdateBodySchema,
  mobileProfileResponseSchema,
  mobileProfileSessionsResponseSchema,
  mobileScheduleEntryChangeSchema,
  mobileScheduleEntrySchema,
  mobileScheduleQuerySchema,
  mobileNotificationReadResponseSchema,
  mobileShiftRequestsResponseSchema,
  mobileShiftRequestHistoryQuerySchema,
  mobileShiftRequestSchema,
  mobileShiftSwapOptionsQuerySchema,
  mobileShiftSwapOptionsResponseSchema,
  mobileUpdateShiftRequestBodySchema,
  mobileOrganizationLookupResponseSchema,
  normalizeMobileScheduleRange,
} from "./mobile";
import { scheduleCellStateSchema } from "./schedule";
import { getOptionalUsPhoneError, normalizeOptionalUsPhone, staffNameSchema } from "./staff";

describe("mobile contracts", () => {
  it("accepts a privacy-redacted organization status", () => {
    expect(
      mobileOrgStatusResponseSchema.parse({
        state: "unavailable",
        isLocked: true,
        trialGraceEndsAt: null,
        orgRole: "admin",
      }),
    ).toEqual({
      state: "unavailable",
      isLocked: true,
      trialGraceEndsAt: null,
      orgRole: "admin",
    });
  });

  it("distinguishes redacted dashboard drafts from an authorized zero", () => {
    const baseMetrics = {
      coveragePct: 100,
      openGapCount: 0,
      pendingApprovalsCount: 0,
    };

    expect(
      mobileDashboardMetricsSchema.parse({ ...baseMetrics, draftSummary: null }),
    ).toMatchObject({
      draftSummary: null,
    });
    expect(
      mobileDashboardMetricsSchema.parse({
        ...baseMetrics,
        draftSummary: { newCount: 0, modifiedCount: 0, deletedCount: 0, total: 0 },
      }),
    ).toMatchObject({
      draftSummary: { total: 0 },
    });
    expect(
      mobileDashboardMetricsSchema.safeParse({
        ...baseMetrics,
        draftSummary: { newCount: 1, modifiedCount: 0, deletedCount: 0, total: 0 },
      }).success,
    ).toBe(false);
  });

  it("rejects invalid schedule state combinations before API handlers reach SQL", () => {
    expect(
      scheduleCellStateSchema.safeParse({
        kind: "worked",
        segments: [],
        absenceTypeId: null,
      }).success,
    ).toBe(false);
    expect(
      scheduleCellStateSchema.safeParse({
        kind: "absence",
        segments: [{ shiftId: 1, jobId: 2, position: 0 }],
        absenceTypeId: 7,
      }).success,
    ).toBe(false);
    expect(
      scheduleCellStateSchema.safeParse({
        kind: "deleted",
        segments: [],
        absenceTypeId: 7,
      }).success,
    ).toBe(false);
  });

  it("validates and normalizes mobile schedule query ranges", () => {
    expect(
      mobileScheduleQuerySchema.safeParse({
        startDate: "2026-04-01",
        endDate: "2026-05-10",
      }).success,
    ).toBe(false);
    expect(
      mobileScheduleQuerySchema.safeParse({
        startDate: "2026-04-10",
        endDate: "2026-04-01",
      }).success,
    ).toBe(false);
    expect(
      normalizeMobileScheduleRange({
        startDate: "2026-04-01",
        endDate: "2026-04-30",
      }),
    ).toEqual({
      startDate: "2026-04-01",
      endDate: "2026-04-30",
    });
  });

  it("requires complete bounded cursors for mobile shift-request history", () => {
    expect(mobileShiftRequestHistoryQuerySchema.parse({ limit: "25" })).toEqual({ limit: 25 });
    expect(
      mobileShiftRequestHistoryQuerySchema.safeParse({
        cursorCreatedAt: "2026-04-01T10:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      mobileShiftRequestHistoryQuerySchema.safeParse({
        cursorCreatedAt: "2026-04-01T10:00:00.000Z",
        cursorId: "00000000-0000-4000-8000-000000000001",
        limit: 101,
      }).success,
    ).toBe(false);
  });

  it("normalizes mobile schedule ranges the same regardless of server timezone", () => {
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = "Etc/GMT-3"; // UTC+3, e.g. Africa/Nairobi
      expect(
        normalizeMobileScheduleRange({
          startDate: "2026-07-05",
          endDate: "2026-07-11",
        }),
      ).toEqual({
        startDate: "2026-07-05",
        endDate: "2026-07-11",
      });
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it("accepts a valid organization lookup response", () => {
    const result = mobileOrganizationLookupResponseSchema.safeParse({
      organization: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Acme Care",
        slug: "acme",
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a mobile login response that requires MFA verification", () => {
    const result = mobileAuthLoginResponseSchema.safeParse({
      session: {
        accessToken: "pending-access-token",
        refreshToken: "pending-refresh-token",
        expiresIn: 3600,
        tokenType: "bearer",
      },
      organization: {
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
      mfaRequired: true,
      mfa: {
        factorId: "factor-123",
        friendlyName: "DubGrid Authenticator",
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid mobile profile response", () => {
    const result = mobileProfileResponseSchema.safeParse({
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "alex@example.com",
        firstName: "Alex",
        lastName: "North",
        createdAt: "2024-01-01T00:00:00.000Z",
        lastSignInAt: "2024-01-02T00:00:00.000Z",
        mfaEnabled: false,
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
        featureFlags: {},
      },
      currentMembership: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Acme Care",
        slug: "acme",
        orgRole: "admin",
        platformRole: "none",
        isCurrent: true,
      },
      effectiveRole: "admin",
      linkedEmployee: {
        id: "33333333-3333-4333-8333-333333333333",
        firstName: "Alex",
        lastName: "North",
        status: "active",
        focusAreaIds: [2],
      },
      focusAreas: [{ id: 2, name: "ICU" }],
    });

    expect(result.success).toBe(true);
    // A server from before the joined date existed omits it; the app still parses.
    expect(result.success ? result.data.joinedAt : "missing").toBeNull();
  });

  it("carries the joined date separately from the account's creation date", () => {
    const base = mobileProfileResponseSchema.parse({
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "alex@example.com",
        firstName: "Alex",
        lastName: "North",
        createdAt: "2024-01-01T00:00:00.000Z",
        lastSignInAt: null,
        mfaEnabled: false,
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
        featureFlags: {},
      },
      currentMembership: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Acme Care",
        slug: "acme",
        orgRole: "user",
        platformRole: "none",
        isCurrent: true,
      },
      effectiveRole: "user",
      linkedEmployee: null,
      focusAreas: [],
      joinedAt: "2026-03-05T14:00:00.000Z",
    });

    expect(base.joinedAt).toBe("2026-03-05T14:00:00.000Z");
    expect(base.user.createdAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("validates and normalizes optional US staff phone numbers", () => {
    for (const input of [
      "(415) 425-3334",
      "4154253334",
      "415-425-3334",
      "415.425.3334",
      "+1 415 425 3334",
      "1 (415) 425-3334",
    ]) {
      expect(normalizeOptionalUsPhone(input)).toBe("(415) 425-3334");
      expect(getOptionalUsPhoneError(input)).toBeNull();
    }

    for (const input of ["123", "jagdhx", "111-222-3333", "+44 20 7946 0958", "415-425-33344"]) {
      expect(getOptionalUsPhoneError(input)).toBeTruthy();
      expect(() => normalizeOptionalUsPhone(input)).toThrow();
    }
  });

  it("validates staff names without rejecting normal punctuation", () => {
    expect(staffNameSchema.parse("  Anne-Marie O'Neil  ")).toBe("Anne-Marie O'Neil");
    expect(staffNameSchema.safeParse("123").success).toBe(false);
    expect(staffNameSchema.safeParse("https://example.com").success).toBe(false);
  });

  it("accepts profile phone update input", () => {
    const result = mobileProfilePhoneUpdateBodySchema.safeParse({
      phone: "415-425-3334",
      expectedVersion: 3,
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.data.phone : null).toBe("(415) 425-3334");
  });

  it("accepts profile account update input", () => {
    const result = mobileProfileAccountUpdateBodySchema.safeParse({
      firstName: "Alex",
      lastName: "North",
    });

    expect(result.success).toBe(true);
  });

  it("accepts profile change request input", () => {
    const result = mobileProfileChangeRequestCreateBodySchema.safeParse({
      type: "profile_update",
      requestedChanges: {
        firstName: "Alex",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects self-service profile change request fields users can manage elsewhere", () => {
    const result = mobileProfileChangeRequestCreateBodySchema.safeParse({
      type: "profile_update",
      requestedChanges: {
        employeeEmail: "alex@example.com",
        contactNotes: "Private admin note",
      },
    });

    expect(result.success).toBe(false);
  });

  it("accepts mobile people employment type fields", () => {
    const personResult = mobilePersonSchema.safeParse({
      id: "33333333-3333-4333-8333-333333333333",
      employeeNumber: 1001,
      firstName: "Alex",
      lastName: "North",
      employmentType: "part_time",
      phone: "",
      email: "alex@example.com",
      status: "active",
      focusAreaIds: [1],
    });
    const updateResult = mobilePersonUpdateBodySchema.safeParse({
      expectedVersion: 1,
      firstName: "Alex",
      lastName: "North",
      phone: "",
      email: "alex@example.com",
      contactNotes: "",
      employmentType: "part_time",
      certificationId: null,
      focusAreaIds: [1],
      roleIds: [],
      departmentIds: [],
    });

    expect(personResult.success).toBe(true);
    expect(updateResult.success).toBe(true);
  });

  it("accepts a valid mobile person response", () => {
    const result = mobilePersonResponseSchema.safeParse({
      person: {
        id: "33333333-3333-4333-8333-333333333333",
        employeeNumber: 1042,
        firstName: "Alex",
        lastName: "North",
        employmentType: "full_time",
        phone: "",
        email: "alex@example.com",
        status: "active",
        certificationId: null,
        roleIds: [],
        seniority: 2,
        focusAreaIds: [1],
        departmentIds: [],
        deptAdminIds: [],
        contactNotes: "",
        statusChangedAt: null,
        statusNote: "",
        userId: null,
        version: 4,
        pendingInvitation: null,
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts mobile notification preferences and profile sessions", () => {
    const prefsResult = mobileNotificationPreferencesResponseSchema.safeParse({
      prefs: {
        schedule: { in_app: true, email: false },
        shift_requests: { in_app: true, email: true },
        system: { in_app: true, email: false },
      },
    });
    const sessionsResult = mobileProfileSessionsResponseSchema.safeParse({
      active: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          platform: "ios",
          appVersion: null,
          deviceLabel: "DubGrid Mobile on iOS",
          browserName: null,
          browserVersion: null,
          ipAddress: null,
          locationCity: null,
          locationCountry: null,
          lastActiveAt: "2024-01-03T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
          refreshTokenHash: "hash",
          isCurrent: true,
        },
      ],
      stale: [],
    });

    expect(prefsResult.success).toBe(true);
    expect(sessionsResult.success).toBe(true);
  });

  it("accepts a valid mobile auth login response", () => {
    const result = mobileAuthLoginResponseSchema.safeParse({
      session: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresIn: 3600,
        tokenType: "bearer",
      },
      organization: {
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
          disable_realtime: true,
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
        canEditScheduleIndicators: false,
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
          color: "#FEE2E2",
          borderColor: "#FCA5A5",
          textColor: "#991B1B",
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
      roles: [{ id: 3, name: "Registered Nurse", abbr: "RN", requiredCertificationIds: [8] }],
      unreadNotificationCount: 3,
    });

    if (!result.success) {
      throw result.error;
    }
    expect(result.data.absenceTypes[0]).toMatchObject({
      color: "#FEE2E2",
      borderColor: "#FCA5A5",
      textColor: "#991B1B",
    });
    expect(result.data.roles).toEqual([
      { id: 3, name: "Registered Nurse", abbr: "RN", requiredCertificationIds: [8] },
    ]);
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
          disable_realtime: true,
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
        canEditScheduleIndicators: false,
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
          disable_realtime: true,
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
        canEditScheduleIndicators: false,
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
    expect(result.data?.linkedEmployee?.departmentIds).toEqual([]);
  });

  it("parses a linked employee's departmentIds when present", () => {
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
          disable_realtime: true,
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
        canEditScheduleIndicators: false,
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
        focusAreaIds: [],
        departmentIds: [9],
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
    expect(result.data?.linkedEmployee?.departmentIds).toEqual([9]);
  });

  it("accepts notification types that mobile already receives pushes for but previously had no schema entry", () => {
    const base = {
      id: "5c1e2f3a-1111-4b2c-8888-abcdef123456",
      channel: "in_app" as const,
      category: "billing",
      priority: "high" as const,
      title: "Trial ending soon",
      message: "Your trial ends in 2 days.",
      metadata: {},
      readAt: null,
      archivedAt: null,
      createdAt: "2026-07-01T00:00:00.000Z",
    };

    for (const type of [
      "shift_request_expired",
      "invitation_expired",
      "member_dept_changed",
      "billing_trial_ending_soon",
      "billing_trial_expired",
      "org_created",
      "org_trial_started",
      "org_archived",
      "org_restored",
      "org_subscription_converted",
      "org_subscription_canceled",
      "org_payment_failed",
    ] as const) {
      const result = mobileNotificationSchema.safeParse({ ...base, type });
      expect(result.success).toBe(true);
    }
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
    expect(result.data?.openShifts[0]?.canVolunteer).toBe(true);
    expect(result.data?.openShifts[0]?.volunteerBlockReason).toBeNull();
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
    expect(result.data?.change).toBeNull();
    expect(result.data).not.toHaveProperty("shiftIds");
    expect(result.data).not.toHaveProperty("jobIds");
    expect(result.data).not.toHaveProperty("assignmentLabel");
  });

  it("accepts a typed previous presentation for edited mobile shifts", () => {
    const result = mobileScheduleEntryChangeSchema.safeParse({
      kind: "modified",
      previousPresentation: {
        label: "Nurse",
        shiftName: "Day Shift",
        focusAreaId: 2,
        focusAreaName: "ICU",
        displayFocusAreaName: "ICU",
        startTime: "07:00:00",
        endTime: "15:00:00",
        segments: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      kind: "modified",
      previousPresentation: { shiftName: "Day Shift" },
    });
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

  it("accepts targeted pickup create requests with an absence type", () => {
    const result = mobileCreateShiftRequestBodySchema.safeParse({
      type: "pickup",
      requesterEmpId: "33333333-3333-4333-8333-333333333333",
      requesterShiftDate: "2026-04-18",
      targetEmpId: "44444444-4444-4444-8444-444444444444",
      targetShiftDate: "2026-04-18",
      absenceTypeId: 7,
    });

    expect(result.success).toBe(true);
  });

  it("requires targeted pickup create requests to include an absence type", () => {
    const result = mobileCreateShiftRequestBodySchema.safeParse({
      type: "pickup",
      requesterEmpId: "33333333-3333-4333-8333-333333333333",
      requesterShiftDate: "2026-04-18",
      targetEmpId: "44444444-4444-4444-8444-444444444444",
      targetShiftDate: "2026-04-18",
    });

    expect(result.success).toBe(false);
  });

  it("rejects targeted pickup create requests for a different date", () => {
    const result = mobileCreateShiftRequestBodySchema.safeParse({
      type: "pickup",
      requesterEmpId: "33333333-3333-4333-8333-333333333333",
      requesterShiftDate: "2026-04-18",
      targetEmpId: "44444444-4444-4444-8444-444444444444",
      targetShiftDate: "2026-04-19",
      absenceTypeId: 7,
    });

    expect(result.success).toBe(false);
  });

  it("rejects absence types on non-targeted pickup create requests", () => {
    const result = mobileCreateShiftRequestBodySchema.safeParse({
      type: "pickup",
      requesterEmpId: "33333333-3333-4333-8333-333333333333",
      requesterShiftDate: "2026-04-18",
      absenceTypeId: 7,
    });

    expect(result.success).toBe(false);
  });

  it("accepts mobile shift swap option queries and responses", () => {
    const query = mobileShiftSwapOptionsQuerySchema.safeParse({
      requesterEmpId: "33333333-3333-4333-8333-333333333333",
      requesterShiftDate: "2026-04-18",
      startDate: "2026-04-18",
      endDate: "2026-04-24",
    });
    const response = mobileShiftSwapOptionsResponseSchema.safeParse({
      range: {
        startDate: "2026-04-18",
        endDate: "2026-04-24",
      },
      entries: [],
    });

    expect(query.success).toBe(true);
    expect(response.success).toBe(true);
  });

  it("rejects invalid shift-request update payloads", () => {
    const result = mobileUpdateShiftRequestBodySchema.safeParse({
      action: "resolve",
      approved: "yes",
    });

    expect(result.success).toBe(false);
  });
});
