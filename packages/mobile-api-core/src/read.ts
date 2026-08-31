import type {
  MobileAbsenceType,
  MobileBootstrapResponse,
  MobileDepartment,
  MobileFocusArea,
  MobileNamedItem,
  MobileBootstrapRole,
  MobileNotification,
  MobileNotificationPriority,
  MobileNotificationsCursor,
  MobileNotificationsQuery,
  MobilePerson,
  MobileScheduleEntry,
  MobileScheduleRange,
} from "@dubgrid/contracts";
import { hasAcceptedCurrentTerms } from "@dubgrid/domain";
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

// `canManageManagementAccess` is omitted deliberately: it is not an admin
// permission the auth context carries, it is derived from `canManageUsers` when
// the payload is built below.
type MobilePermissionsLike = Omit<
  MobileBootstrapResponse["permissions"],
  "canManageManagementAccess"
> & {
  role: string;
  level: number;
  canEditShifts: boolean;
  canApproveShiftRequests: boolean;
  canManageEmployees: boolean;
  canViewStaff: boolean;
  /** authz derives this as super_admin-or-gridmaster, which is the same gate. */
  canManageUsers: boolean;
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
    "canViewSchedule" | "canEditShifts" | "canApproveShiftRequests" | "canManageEmployees"
  >;
};

export type MobilePeopleContext = MobileServiceContext & {
  permissions: Pick<MobilePermissionsLike, "canManageEmployees" | "canViewStaff">;
  user: Pick<MobileUserLike, "id">;
};

export type MobileNotificationsContext = MobileNotificationContext;

type MobilePersonSource = {
  id: string;
  employeeNumber: number;
  firstName: string;
  lastName: string;
  employmentType: MobilePerson["employmentType"];
  phone: string;
  email: string;
  status: MobilePerson["status"];
  orgRole: MobilePerson["orgRole"];
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

type FetchMobileUnreadNotificationCount = (userClient: SupabaseClient) => Promise<number>;

type FetchTermsAcceptedVersion = (userId: string) => Promise<string | null>;

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

type FetchMobileRoles = (
  serviceClient: SupabaseClient,
  orgId: string,
) => Promise<MobileBootstrapRole[]>;

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

export type FetchMobileNotificationsInput = {
  limit: number;
  cursor?: MobileNotificationsCursor | null;
  category?: string;
  type?: string;
  priority?: MobileNotificationPriority;
  read?: "read" | "unread";
  search?: string;
  archived?: "inbox" | "archived" | "any";
  sort?: "asc" | "desc";
};

export type FetchMobileNotificationsResult = {
  unreadCount: number;
  notifications: MobileNotification[];
  nextCursor: MobileNotificationsCursor | null;
};

type FetchMobileNotifications = (
  userClient: SupabaseClient,
  input: FetchMobileNotificationsInput,
) => Promise<FetchMobileNotificationsResult>;

type MapOrganizationToMobileConfig = (org: Organization) => MobileBootstrapResponse["currentOrg"];

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

type MobileNotificationsResponse = FetchMobileNotificationsResult;

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
    fetchMobileRoles: FetchMobileRoles;
    fetchMobileCertifications: FetchMobileNamedItems;
    fetchMobileDepartments: FetchMobileDepartments;
    fetchTermsAcceptedVersion: FetchTermsAcceptedVersion;
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
    termsAcceptedVersion,
  ] = await Promise.all([
    deps.fetchLinkedEmployeeForUser(auth.serviceClient, auth.currentOrg.id, auth.user.id),
    deps.fetchMobileUnreadNotificationCount(auth.userClient),
    deps.fetchMobileAbsenceTypes(auth.serviceClient, auth.currentOrg.id),
    deps.fetchMobileFocusAreas(auth.serviceClient, auth.currentOrg.id),
    deps.fetchMobileRoles(auth.serviceClient, auth.currentOrg.id),
    deps.fetchMobileCertifications(auth.serviceClient, auth.currentOrg.id),
    deps.fetchMobileDepartments(auth.serviceClient, auth.currentOrg.id),
    deps.fetchTermsAcceptedVersion(auth.user.id),
  ]);

  return {
    user: {
      id: auth.user.id,
      email: auth.user.email ?? null,
      firstName: (auth.user.user_metadata?.first_name as string | undefined) ?? null,
      lastName: (auth.user.user_metadata?.last_name as string | undefined) ?? null,
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
    permissions: {
      ...auth.permissions,
      // Not an admin permission on either platform: granting management access
      // and setting org roles is super_admin-or-gridmaster, which authz already
      // derives as canManageUsers. Spelled out here because the response schema
      // strips keys it doesn't name, so it would otherwise fall to its default.
      canManageManagementAccess: auth.permissions.canManageUsers,
    },
    linkedEmployee: linkedEmployee
      ? {
          id: linkedEmployee.id,
          firstName: linkedEmployee.firstName,
          lastName: linkedEmployee.lastName,
          status: linkedEmployee.status,
          focusAreaIds: linkedEmployee.focusAreaIds,
          departmentIds: linkedEmployee.departmentIds,
        }
      : null,
    absenceTypes,
    focusAreas,
    roles,
    certifications,
    departments,
    unreadNotificationCount,
    acceptedCurrentTerms: hasAcceptedCurrentTerms(termsAcceptedVersion),
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
      departmentIds: linkedEmployee.departmentIds,
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

  const people = await deps.fetchMobilePeople(auth.serviceClient, auth.currentOrg.id);
  const visiblePeople = auth.permissions.canManageEmployees
    ? people
    : people.filter((person) => person.status === "active");

  return {
    people: visiblePeople.map((person) => {
      const mobilePerson = deps.mapEmployeeToMobilePerson(person);

      if (auth.permissions.canManageEmployees) {
        return mobilePerson;
      }

      // Preserve userId on the caller's own row so the mobile app can find
      // its own employee record (for /me/schedule lookup, "You" badge, etc.).
      // The caller already knows their own auth id; nulling it here just
      // breaks self-lookup. Other rows still get the link stripped so
      // view-only callers can't map employee → auth account.
      // managementDepartmentIds stays: the app uses it to tell management
      // users apart, since their full profile view is manager-only.
      const isSelf = mobilePerson.userId === auth.user.id;
      return {
        ...mobilePerson,
        contactNotes: "",
        deptAdminIds: [],
        departmentIds: [],
        managementDeptAdminIds: [],
        pendingInvitation: null,
        roleIds: [],
        statusNote: "",
        userId: isSelf ? mobilePerson.userId : null,
      };
    }),
  };
}

export async function loadMobileNotificationsPayload(
  auth: MobileNotificationsContext,
  input: MobileNotificationsQuery,
  deps: {
    fetchMobileNotifications: FetchMobileNotifications;
  },
): Promise<MobileNotificationsResponse> {
  const cursor =
    input.cursorCreatedAt && input.cursorId
      ? { createdAt: input.cursorCreatedAt, id: input.cursorId }
      : null;

  return deps.fetchMobileNotifications(auth.userClient, {
    limit: input.limit ?? 25,
    cursor,
    category: input.category,
    type: input.type,
    priority: input.priority,
    read: input.read,
    search: input.search,
    archived: input.archived,
    sort: input.sort,
  });
}
