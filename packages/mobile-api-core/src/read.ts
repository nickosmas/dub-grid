import type {
  MobileAbsenceType,
  MobileBootstrapResponse,
  MobileDepartment,
  MobileFocusArea,
  MobileIndicatorType,
  MobileNamedItem,
  MobileBootstrapRole,
  MobileNotification,
  MobileNotificationPriority,
  MobileNotificationsCursor,
  MobileNotificationsQuery,
  MobilePerson,
  MobileScheduleEntry,
  MobileScheduleIndicator,
  MobileScheduleRange,
} from "@dubgrid/contracts";
import { hasAcceptedCurrentTerms } from "@dubgrid/domain";
import {
  canSeeDraftScheduleNotes,
  scheduleNotesForViewer,
  type ScheduleNoteStatus,
} from "@dubgrid/schedule-core";
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

// `canManageManagementAccess` and `canEditScheduleIndicators` are omitted
// deliberately: neither is an admin permission the auth context carries. The
// payload built below derives them from `canManageUsers` and `canEditNotes`.
type MobilePermissionsLike = Omit<
  MobileBootstrapResponse["permissions"],
  "canManageManagementAccess" | "canEditScheduleIndicators"
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

type MobilePublisherViewerPermissions = Pick<MobilePermissionsLike, "canPublishSchedule" | "level">;

type MobileNoteViewerPermissions = Pick<MobilePermissionsLike, "canEditShifts" | "canEditNotes">;

export type MobileMeScheduleContext = MobileServiceContext & {
  user: Pick<MobileUserLike, "id">;
  permissions: MobilePublisherViewerPermissions & MobileNoteViewerPermissions;
};

export type MobileOrgScheduleContext = MobileServiceContext & {
  permissions: Pick<
    MobilePermissionsLike,
    "canViewSchedule" | "canEditShifts" | "canApproveShiftRequests" | "canManageEmployees"
  > &
    MobilePublisherViewerPermissions &
    MobileNoteViewerPermissions;
};

/** A schedule note as the schedule loaders receive it, before the viewer's rule. */
export type MobileScheduleNoteRecord = {
  employeeId: string;
  date: string;
  indicatorTypeId: number;
  focusAreaId: number | null;
  shiftId: number | null;
  jobId: number | null;
  status: ScheduleNoteStatus;
  name: string;
  color: string;
};

const INDICATOR_STATE: Record<ScheduleNoteStatus, MobileScheduleIndicator["state"]> = {
  published: "published",
  draft: "draft_added",
  draft_deleted: "draft_removed",
};

/**
 * Each entry's indicators, as this viewer may see them (42b). The notes were
 * read past the row policy, so the shared rule is what keeps drafts from
 * viewers; a note on a date with no entry has nothing to ride on and is left
 * out, as mobile shows no draft-only shifts.
 */
export function withScheduleIndicators<TEntry extends { employeeId: string; date: string }>(
  entries: TEntry[],
  notes: MobileScheduleNoteRecord[],
  permissions: MobileNoteViewerPermissions,
): (TEntry & { indicators: MobileScheduleIndicator[] })[] {
  const byCell = new Map<string, MobileScheduleIndicator[]>();
  for (const note of scheduleNotesForViewer(notes, canSeeDraftScheduleNotes(permissions))) {
    const key = `${note.employeeId}_${note.date}`;
    const list = byCell.get(key) ?? [];
    list.push({
      indicatorTypeId: note.indicatorTypeId,
      focusAreaId: note.focusAreaId,
      shiftId: note.shiftId,
      jobId: note.jobId,
      name: note.name,
      color: note.color,
      state: INDICATOR_STATE[note.status],
    });
    byCell.set(key, list);
  }
  return entries.map((entry) => ({
    ...entry,
    indicators: byCell.get(`${entry.employeeId}_${entry.date}`) ?? [],
  }));
}

/**
 * Who published a shift is process detail for the people who publish: the web
 * keeps its publish history behind `canPublishSchedule` (or super admin), so
 * the mobile payload keeps the publisher's name behind the same gate. The
 * publish time stays for everyone; it says whether the schedule is current.
 */
export function canSeeSchedulePublisher(permissions: MobilePublisherViewerPermissions): boolean {
  return permissions.canPublishSchedule || permissions.level >= 3;
}

function withoutPublisherName<TEntry extends { publishedByName: string | null }>(
  entries: TEntry[],
  permissions: MobilePublisherViewerPermissions,
): TEntry[] {
  if (canSeeSchedulePublisher(permissions)) return entries;
  return entries.map((entry) =>
    entry.publishedByName === null ? entry : { ...entry, publishedByName: null },
  );
}

export type MobilePeopleContext = MobileServiceContext & {
  permissions: Pick<
    MobilePermissionsLike,
    "canManageEmployees" | "canViewStaff" | "canViewEmployeeDetails"
  >;
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
type FetchMfaReenrollRequired = (userId: string) => Promise<boolean>;

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

type FetchMobileIndicatorTypes = (
  serviceClient: SupabaseClient,
  orgId: string,
) => Promise<MobileIndicatorType[]>;

type FetchMobileScheduleEntries = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    startDate: string;
    endDate: string;
    employeeId?: string;
  },
) => Promise<MobileScheduleEntry[]>;

type FetchMobileScheduleNotes = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    startDate: string;
    endDate: string;
    employeeId?: string;
  },
) => Promise<MobileScheduleNoteRecord[]>;

type FetchMobilePeople = (
  serviceClient: SupabaseClient,
  orgId: string,
) => Promise<MobilePersonSource[]>;

export type FetchMobileNotificationsInput = {
  id?: string;
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
    fetchMobileIndicatorTypes: FetchMobileIndicatorTypes;
    fetchTermsAcceptedVersion: FetchTermsAcceptedVersion;
    fetchMfaReenrollRequired: FetchMfaReenrollRequired;
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
    indicatorTypes,
    termsAcceptedVersion,
    mfaReenrollRequired,
  ] = await Promise.all([
    deps.fetchLinkedEmployeeForUser(auth.serviceClient, auth.currentOrg.id, auth.user.id),
    deps.fetchMobileUnreadNotificationCount(auth.userClient),
    deps.fetchMobileAbsenceTypes(auth.serviceClient, auth.currentOrg.id),
    deps.fetchMobileFocusAreas(auth.serviceClient, auth.currentOrg.id),
    deps.fetchMobileRoles(auth.serviceClient, auth.currentOrg.id),
    deps.fetchMobileCertifications(auth.serviceClient, auth.currentOrg.id),
    deps.fetchMobileDepartments(auth.serviceClient, auth.currentOrg.id),
    // Every member sees indicators, so their types carry no permission gate.
    deps.fetchMobileIndicatorTypes(auth.serviceClient, auth.currentOrg.id),
    deps.fetchTermsAcceptedVersion(auth.user.id),
    deps.fetchMfaReenrollRequired(auth.user.id),
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
      canEditScheduleIndicators: auth.permissions.canEditNotes,
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
    mfaReenrollRequired,
    indicatorTypes,
  };
}

export async function loadMobileMeSchedulePayload(
  auth: MobileMeScheduleContext,
  range: MobileScheduleRange,
  deps: {
    fetchLinkedEmployeeForUser: FetchLinkedEmployeeForUser;
    fetchMobileScheduleEntries: FetchMobileScheduleEntries;
    fetchMobileScheduleNotes: FetchMobileScheduleNotes;
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

  const scope = { orgId: auth.currentOrg.id, employeeId: linkedEmployee.id, ...range };
  const [entries, notes] = await Promise.all([
    deps.fetchMobileScheduleEntries(auth.serviceClient, scope),
    deps.fetchMobileScheduleNotes(auth.serviceClient, scope),
  ]);

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
    entries: withoutPublisherName(
      withScheduleIndicators(entries, notes, auth.permissions),
      auth.permissions,
    ),
  };
}

export async function loadMobileOrgSchedulePayload(
  auth: MobileOrgScheduleContext,
  range: MobileScheduleRange,
  deps: {
    fetchMobileScheduleEntries: FetchMobileScheduleEntries;
    fetchMobileScheduleNotes: FetchMobileScheduleNotes;
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

  const scope = { orgId: auth.currentOrg.id, ...range };
  const [entries, notes] = await Promise.all([
    deps.fetchMobileScheduleEntries(auth.serviceClient, scope),
    deps.fetchMobileScheduleNotes(auth.serviceClient, scope),
  ]);

  return {
    range,
    entries: withoutPublisherName(
      withScheduleIndicators(entries, notes, auth.permissions),
      auth.permissions,
    ),
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
    : people.filter((person) => person.status === "active" && person.userId !== auth.user.id);

  return {
    people: visiblePeople.map((person) => {
      const mobilePerson = deps.mapEmployeeToMobilePerson(person);

      // Contact details follow canViewEmployeeDetails, which authz derives from
      // canManageEmployees, so every staff manager still qualifies. The looser
      // gate also lets a view-only admin see on mobile what the web People table
      // already shows them, instead of blanks.
      if (auth.permissions.canViewEmployeeDetails) {
        return mobilePerson;
      }

      // Regular users get a directory payload, not an account or contact
      // export. Keep the visible scheduling qualifications used by the list
      // while removing hidden fields and auth-account links.
      return {
        ...mobilePerson,
        contactNotes: "",
        deptAdminIds: [],
        departmentIds: [],
        email: "",
        managementDeptAdminIds: [],
        pendingInvitation: null,
        phone: "",
        statusNote: "",
        userId: null,
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
    id: input.id,
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
