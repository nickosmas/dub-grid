import type {
  MobileAbsenceType,
  MobileBootstrapResponse,
  MobileDepartment,
  MobileFocusArea,
  MobileNamedItem,
  MobileNotification,
  MobilePerson,
  MobileScheduleEntry,
  MobileScheduleRange,
} from "@dubgrid/contracts";
import type { Organization, PlatformRole } from "@dubgrid/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

export class MobileApiAuthorizationError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "MobileApiAuthorizationError";
  }
}

type MobileLinkedEmployee = NonNullable<MobileBootstrapResponse["linkedEmployee"]>;

type MobileUserLike = {
  id: string;
  email?: string | null;
  user_metadata?: {
    first_name?: unknown;
    last_name?: unknown;
  } | null;
};

type MobileMembershipLike = {
  orgId: string;
  orgName: string;
  orgSlug: string | null;
  orgRole: string;
  platformRole: PlatformRole;
};

type MobilePermissionsLike = MobileBootstrapResponse["permissions"] & {
  role: string;
  level: number;
  canEditShifts: boolean;
  canApproveShiftRequests: boolean;
  canManageEmployees: boolean;
  canViewStaff: boolean;
};

type MobileServiceContext = {
  currentOrg: Pick<Organization, "id">;
  serviceClient: SupabaseClient;
};

type MobileNotificationContext = {
  userClient: SupabaseClient;
};

export type MobileBootstrapContext = MobileServiceContext &
  MobileNotificationContext & {
    currentOrg: Organization;
    memberships: MobileMembershipLike[];
    permissions: MobilePermissionsLike;
    user: MobileUserLike;
  };

export type MobileMeScheduleContext = MobileServiceContext & {
  user: Pick<MobileUserLike, "id">;
};

export type MobileOrgScheduleContext = MobileServiceContext & {
  permissions: Pick<
    MobilePermissionsLike,
    | "canViewSchedule"
    | "canEditShifts"
    | "canApproveShiftRequests"
    | "canManageEmployees"
  >;
};

export type MobilePeopleContext = MobileServiceContext & {
  permissions: Pick<MobilePermissionsLike, "canManageEmployees" | "canViewStaff">;
};

export type MobileNotificationsContext = MobileNotificationContext;

type MobilePersonSource = {
  id: string;
  firstName: string;
  lastName: string;
  employmentType: MobilePerson["employmentType"];
  phone: string;
  email: string;
  status: MobilePerson["status"];
  certificationId: number | null;
  roleIds: number[];
  seniority: number;
  focusAreaIds: number[];
  departmentIds: number[];
  deptAdminIds: number[];
  managementDepartmentIds: number[];
  managementDeptAdminIds: number[];
  contactNotes: string;
  statusChangedAt: string | null;
  statusNote: string;
  userId: string | null;
  version: number;
  pendingInvitation: MobilePerson["pendingInvitation"];
};

type FetchLinkedEmployeeForUser = (
  serviceClient: SupabaseClient,
  orgId: string,
  userId: string,
) => Promise<MobileLinkedEmployee | null>;

type FetchMobileUnreadNotificationCount = (
  userClient: SupabaseClient,
) => Promise<number>;

type FetchMobileAbsenceTypes = (
  serviceClient: SupabaseClient,
  orgId: string,
) => Promise<MobileAbsenceType[]>;

type FetchMobileFocusAreas = (
  serviceClient: SupabaseClient,
  orgId: string,
) => Promise<MobileFocusArea[]>;

type FetchMobileNamedItems = (
  serviceClient: SupabaseClient,
  orgId: string,
) => Promise<MobileNamedItem[]>;

type FetchMobileDepartments = (
  serviceClient: SupabaseClient,
  orgId: string,
) => Promise<MobileDepartment[]>;

type FetchMobileScheduleEntries = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    startDate: string;
    endDate: string;
    employeeId?: string;
  },
) => Promise<MobileScheduleEntry[]>;

type FetchMobilePeople = (
  serviceClient: SupabaseClient,
  orgId: string,
) => Promise<MobilePersonSource[]>;

type FetchMobileNotifications = (
  userClient: SupabaseClient,
  input: { limit: number; offset: number },
) => Promise<{
  unreadCount: number;
  notifications: MobileNotification[];
}>;

type MapOrganizationToMobileConfig = (
  org: Organization,
) => MobileBootstrapResponse["currentOrg"];

type MapEmployeeToMobilePerson = (person: MobilePersonSource) => MobilePerson;

type MobileMeScheduleResponse = {
  employee: MobileLinkedEmployee | null;
  range: MobileScheduleRange;
  entries: MobileScheduleEntry[];
};

type MobileOrgScheduleResponse = {
  range: MobileScheduleRange;
  entries: MobileScheduleEntry[];
};

type MobilePeopleResponse = {
  people: MobilePerson[];
};

type MobileNotificationsResponse = {
  unreadCount: number;
  notifications: MobileNotification[];
};

export function getEffectiveMobileRole(role: string): "super_admin" | "admin" | "user" {
  return role === "super_admin" || role === "admin" ? role : "user";
}

export function canViewMobileOrgSchedule(input: {
  canViewSchedule: boolean;
  canEditShifts: boolean;
  canApproveShiftRequests: boolean;
  canManageEmployees: boolean;
}): boolean {
  return (
    input.canViewSchedule ||
    input.canEditShifts ||
    input.canApproveShiftRequests ||
    input.canManageEmployees
  );
}

export async function loadMobileBootstrapPayload(
  auth: MobileBootstrapContext,
  deps: {
    fetchLinkedEmployeeForUser: FetchLinkedEmployeeForUser;
    fetchMobileUnreadNotificationCount: FetchMobileUnreadNotificationCount;
    fetchMobileAbsenceTypes: FetchMobileAbsenceTypes;
    fetchMobileFocusAreas: FetchMobileFocusAreas;
    fetchMobileRoles: FetchMobileNamedItems;
    fetchMobileCertifications: FetchMobileNamedItems;
    fetchMobileDepartments: FetchMobileDepartments;
    mapOrganizationToMobileConfig: MapOrganizationToMobileConfig;
  },
): Promise<MobileBootstrapResponse> {
  const [
    linkedEmployee,
    unreadNotificationCount,
    absenceTypes,
    focusAreas,
    roles,
    certifications,
    departments,
  ] =
    await Promise.all([
      deps.fetchLinkedEmployeeForUser(
        auth.serviceClient,
        auth.currentOrg.id,
        auth.user.id,
      ),
      deps.fetchMobileUnreadNotificationCount(auth.userClient),
      deps.fetchMobileAbsenceTypes(auth.serviceClient, auth.currentOrg.id),
      deps.fetchMobileFocusAreas(auth.serviceClient, auth.currentOrg.id),
      deps.fetchMobileRoles(auth.serviceClient, auth.currentOrg.id),
      deps.fetchMobileCertifications(auth.serviceClient, auth.currentOrg.id),
      deps.fetchMobileDepartments(auth.serviceClient, auth.currentOrg.id),
    ]);

  return {
    user: {
      id: auth.user.id,
      email: auth.user.email ?? null,
      firstName:
        (auth.user.user_metadata?.first_name as string | undefined) ?? null,
      lastName:
        (auth.user.user_metadata?.last_name as string | undefined) ?? null,
    },
    currentOrg: deps.mapOrganizationToMobileConfig(auth.currentOrg),
    memberships: auth.memberships.map((membership) => ({
      id: membership.orgId,
      name: membership.orgName,
      slug: membership.orgSlug,
      orgRole: getEffectiveMobileRole(membership.orgRole),
      platformRole: membership.platformRole,
      isCurrent: membership.orgId === auth.currentOrg.id,
    })),
    effectiveRole: getEffectiveMobileRole(auth.permissions.role),
    permissions: auth.permissions,
    linkedEmployee: linkedEmployee
      ? {
          id: linkedEmployee.id,
          firstName: linkedEmployee.firstName,
          lastName: linkedEmployee.lastName,
          status: linkedEmployee.status,
          focusAreaIds: linkedEmployee.focusAreaIds,
        }
      : null,
    absenceTypes,
    focusAreas,
    roles,
    certifications,
    departments,
    unreadNotificationCount,
  };
}

export async function loadMobileMeSchedulePayload(
  auth: MobileMeScheduleContext,
  range: MobileScheduleRange,
  deps: {
    fetchLinkedEmployeeForUser: FetchLinkedEmployeeForUser;
    fetchMobileScheduleEntries: FetchMobileScheduleEntries;
  },
): Promise<MobileMeScheduleResponse> {
  const linkedEmployee = await deps.fetchLinkedEmployeeForUser(
    auth.serviceClient,
    auth.currentOrg.id,
    auth.user.id,
  );

  if (!linkedEmployee) {
    return {
      employee: null,
      range,
      entries: [],
    };
  }

  const entries = await deps.fetchMobileScheduleEntries(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    employeeId: linkedEmployee.id,
    ...range,
  });

  return {
    employee: {
      id: linkedEmployee.id,
      firstName: linkedEmployee.firstName,
      lastName: linkedEmployee.lastName,
      status: linkedEmployee.status,
      focusAreaIds: linkedEmployee.focusAreaIds,
    },
    range,
    entries,
  };
}

export async function loadMobileOrgSchedulePayload(
  auth: MobileOrgScheduleContext,
  range: MobileScheduleRange,
  deps: {
    fetchMobileScheduleEntries: FetchMobileScheduleEntries;
  },
): Promise<MobileOrgScheduleResponse> {
  if (
    !canViewMobileOrgSchedule({
      canViewSchedule: auth.permissions.canViewSchedule,
      canEditShifts: auth.permissions.canEditShifts,
      canApproveShiftRequests: auth.permissions.canApproveShiftRequests,
      canManageEmployees: auth.permissions.canManageEmployees,
    })
  ) {
    throw new MobileApiAuthorizationError();
  }

  const entries = await deps.fetchMobileScheduleEntries(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    ...range,
  });

  return {
    range,
    entries,
  };
}

export async function loadMobilePeoplePayload(
  auth: MobilePeopleContext,
  deps: {
    fetchMobilePeople: FetchMobilePeople;
    mapEmployeeToMobilePerson: MapEmployeeToMobilePerson;
  },
): Promise<MobilePeopleResponse> {
  if (!auth.permissions.canViewStaff) {
    throw new MobileApiAuthorizationError();
  }

  const people = await deps.fetchMobilePeople(
    auth.serviceClient,
    auth.currentOrg.id,
  );
  const visiblePeople = auth.permissions.canManageEmployees
    ? people
    : people.filter((person) => person.status === "active");

  return {
    people: visiblePeople.map((person) => {
      const mobilePerson = deps.mapEmployeeToMobilePerson(person);

      if (auth.permissions.canManageEmployees) {
        return mobilePerson;
      }

      return {
        ...mobilePerson,
        contactNotes: "",
        deptAdminIds: [],
        departmentIds: [],
        managementDepartmentIds: [],
        managementDeptAdminIds: [],
        pendingInvitation: null,
        roleIds: [],
        statusNote: "",
        userId: null,
      };
    }),
  };
}

export async function loadMobileNotificationsPayload(
  auth: MobileNotificationsContext,
  input: { limit?: number; offset?: number },
  deps: {
    fetchMobileNotifications: FetchMobileNotifications;
  },
): Promise<MobileNotificationsResponse> {
  return deps.fetchMobileNotifications(auth.userClient, {
    limit: input.limit ?? 20,
    offset: input.offset ?? 0,
  });
}
