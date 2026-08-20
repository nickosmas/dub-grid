import { beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_TERMS_VERSION } from "@dubgrid/domain";

const requireMobileAuth = vi.fn();
const fetchMobileAbsenceTypes = vi.fn();
const fetchMobileCertifications = vi.fn();
const fetchMobileDepartments = vi.fn();
const fetchMobileFocusAreas = vi.fn();
const fetchMobileRoles = vi.fn();
const fetchLinkedEmployeeForUser = vi.fn();
const fetchMobileUnreadNotificationCount = vi.fn();
const fetchMobileTermsAcceptedVersion = vi.fn();
const mapOrganizationToMobileConfig = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  fetchMobileAbsenceTypes,
  fetchMobileCertifications,
  fetchMobileDepartments,
  fetchMobileFocusAreas,
  fetchMobileRoles,
  requireMobileAuth,
  fetchLinkedEmployeeForUser,
  fetchMobileUnreadNotificationCount,
  fetchMobileTermsAcceptedVersion,
  mapOrganizationToMobileConfig,
}));

describe("GET /api/mobile/v1/bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the mobile bootstrap payload for the authenticated session", async () => {
    requireMobileAuth.mockResolvedValue({
      user: {
        id: "8af6f242-c060-4920-a7db-91b4cb66fd26",
        email: "manager@dubgrid.com",
        user_metadata: {
          first_name: "Mina",
          last_name: "Diaz",
        },
      },
      currentOrg: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
      },
      memberships: [
        {
          orgId: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
          orgName: "DubGrid Health",
          orgSlug: "dubgrid-health",
          orgRole: "admin",
          platformRole: "none",
        },
      ],
      permissions: {
        role: "admin",
        level: 2,
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
        canApproveShiftRequests: true,
        canViewDashboardAnalytics: false,
        orgId: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        isLoading: false,
        isGridmaster: false,
        isSuperAdmin: false,
        isImpersonating: false,
        isUserViewActive: false,
        isInactive: false,
        actualLevel: 2,
        canManageOrg: false,
        canAccessSettings: false,
        canManageUsers: false,
        canConfigureAdminPermissions: false,
      },
      serviceClient: {},
      userClient: {},
    });
    fetchLinkedEmployeeForUser.mockResolvedValue({
      id: "d660d308-4e0d-4daf-84fd-6753405e6740",
      firstName: "Mina",
      lastName: "Diaz",
      status: "active",
      focusAreaIds: [2],
      departmentIds: [5],
    });
    fetchMobileAbsenceTypes.mockResolvedValue([
      {
        id: 1,
        label: "Sick",
        name: "Sick leave",
        color: "#FEE2E2",
        borderColor: "#FCA5A5",
        textColor: "#991B1B",
      },
    ]);
    fetchMobileFocusAreas.mockResolvedValue([
      {
        id: 2,
        name: "ICU",
        departmentId: 5,
      },
    ]);
    fetchMobileRoles.mockResolvedValue([
      {
        id: 3,
        name: "Charge Nurse",
        abbr: "CN",
      },
    ]);
    fetchMobileCertifications.mockResolvedValue([
      {
        id: 4,
        name: "Registered Nurse",
        abbr: "RN",
      },
    ]);
    fetchMobileDepartments.mockResolvedValue([
      {
        id: 5,
        name: "Nursing",
        abbr: "NUR",
        type: "scheduled",
      },
    ]);
    fetchMobileUnreadNotificationCount.mockResolvedValue(4);
    fetchMobileTermsAcceptedVersion.mockResolvedValue(CURRENT_TERMS_VERSION);
    mapOrganizationToMobileConfig.mockReturnValue({
      id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
      name: "DubGrid Health",
      slug: "dubgrid-health",
      timezone: "America/Los_Angeles",
      shiftDisplayMode: "code",
      labels: {
        focusArea: "Focus Area",
        certification: "Certification",
        role: "Role",
        department: "Department",
      },
      featureFlags: {},
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/mobile/v1/bootstrap") as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchLinkedEmployeeForUser).toHaveBeenCalled();
    expect(fetchMobileUnreadNotificationCount).toHaveBeenCalledWith({});
    expect(payload).toMatchObject({
      user: {
        email: "manager@dubgrid.com",
        firstName: "Mina",
        lastName: "Diaz",
      },
      effectiveRole: "admin",
      unreadNotificationCount: 4,
      acceptedCurrentTerms: true,
      memberships: [
        {
          id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
          isCurrent: true,
          orgRole: "admin",
        },
      ],
      linkedEmployee: {
        id: "d660d308-4e0d-4daf-84fd-6753405e6740",
        focusAreaIds: [2],
        departmentIds: [5],
      },
      absenceTypes: [
        {
          id: 1,
          label: "Sick",
          name: "Sick leave",
          color: "#FEE2E2",
          borderColor: "#FCA5A5",
          textColor: "#991B1B",
        },
      ],
      focusAreas: [
        {
          id: 2,
          name: "ICU",
          departmentId: 5,
        },
      ],
      roles: [
        {
          id: 3,
          name: "Charge Nurse",
          abbr: "CN",
        },
      ],
      certifications: [
        {
          id: 4,
          name: "Registered Nurse",
          abbr: "RN",
        },
      ],
      departments: [
        {
          id: 5,
          name: "Nursing",
          abbr: "NUR",
          type: "scheduled",
        },
      ],
    });
  });
});
