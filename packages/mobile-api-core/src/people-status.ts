import type { MobilePerson, MobilePersonStatusUpdateBody } from "@dubgrid/contracts";
import type { Employee } from "@dubgrid/domain";
import {
  AWAY_ABSENCE_INVALID_CODE,
  AWAY_ABSENCE_NEEDS_DATE_MESSAGE,
  AWAY_ABSENCE_UNKNOWN_MESSAGE,
  canMarkInactive,
  isAwayAbsenceRefusal,
  isSelfAction,
  isValidPlannedStart,
  isValidReturnDate,
  NO_PLANNED_CHANGE_CODE,
  NO_PLANNED_CHANGE_MESSAGE,
  NOT_AWAY_CODE,
  NOT_AWAY_MESSAGE,
  NOT_ON_SCHEDULE_MESSAGE,
  NOT_PLANNABLE_CODE,
  NOT_PLANNABLE_MESSAGE,
  NOT_SUSPENDABLE_CODE,
  NOT_SUSPENDABLE_MESSAGE,
  NOT_SUSPENDED_CODE,
  NOT_SUSPENDED_MESSAGE,
  RETURN_DATE_INVALID_CODE,
  RETURN_DATE_INVALID_MESSAGE,
  PLANNED_RETURN_INVALID_MESSAGE,
  PLANNED_START_INVALID_CODE,
  PLANNED_START_INVALID_MESSAGE,
  SELF_ACTION_FORBIDDEN_CODE,
  SELF_ACTION_FORBIDDEN_MESSAGE,
} from "@dubgrid/domain";
import { getIsoDateInTimeZone } from "@dubgrid/schedule-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MobileApiAuthorizationError } from "./read";

const STATUS_CONFLICT_MESSAGE =
  "Employee status changed elsewhere. Review the latest values before saving again.";

type PeopleStatusContext = {
  currentOrg: {
    id: string;
    timezone?: string | null;
  };
  permissions: {
    canManageEmployees: boolean;
    // Gates syncing organization_memberships alongside employees.status —
    // mirrors the tier DELETE /api/organizations/access requires on web, so
    // a plain admin with only canManageEmployees can't use remove/activate as
    // a side door to change org access they aren't allowed to touch directly.
    // Gridmaster mobile access is blocked entirely at auth resolution, so
    // super_admin is the only tier that needs checking here.
    isSuperAdmin: boolean;
  };
  serviceClient: SupabaseClient;
  user: {
    id: string;
    email?: string | null;
  };
};

type FetchEmployeeById = (
  serviceClient: SupabaseClient,
  orgId: string,
  employeeId: string,
) => Promise<Employee | null>;

type UpdateEmployeeStatus = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId: string;
    expectedVersion: number;
    status: Employee["status"];
    statusNote: string;
    statusChangedAt: string;
    archivedAt?: string | null;
    awayUntil: string | null;
    awayAbsenceTypeId: number | null;
    updatedBy: string;
  },
) => Promise<Employee | null>;

type UpdateEmployeeReturnDate = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId: string;
    expectedVersion: number;
    awayUntil: string | null;
    awayAbsenceTypeId: number | null;
    updatedBy: string;
  },
) => Promise<Employee | null>;

type UpdateEmployeeSuspension = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId: string;
    expectedVersion: number;
    suspended: boolean;
    updatedBy: string;
  },
) => Promise<Employee | null>;

type UpdateEmployeePlannedChange = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId: string;
    expectedVersion: number;
    plannedStatus: "away" | null;
    plannedFrom: string | null;
    plannedUntil: string | null;
    plannedAbsenceTypeId: number | null;
    plannedNote?: string;
    updatedBy: string;
  },
) => Promise<Employee | null>;

/** Signs someone out everywhere and stops their push in one organization. */
type EndAccess = (
  serviceClient: SupabaseClient,
  input: { userId: string; orgId: string },
) => Promise<void>;

type InsertAuditLog = (
  serviceClient: SupabaseClient,
  input: {
    org_id: string;
    actor_id: string;
    actor_email: string | null;
    action: string;
    resource_type: string;
    resource_id: string;
    details: Record<string, unknown>;
    ip_address: string | null;
    user_agent: string | null;
  },
) => Promise<void>;

type MapEmployeeToMobilePerson = (employee: Employee) => MobilePerson;

type FetchActiveMembershipOrgRole = (
  serviceClient: SupabaseClient,
  orgId: string,
  userId: string,
) => Promise<string | null>;

type CountActiveSuperAdmins = (serviceClient: SupabaseClient, orgId: string) => Promise<number>;

type ArchiveOrganizationMembership = (
  serviceClient: SupabaseClient,
  input: { orgId: string; userId: string; archivedByUserId: string; archivedAt: string },
) => Promise<void>;

type RestoreOrganizationMembership = (
  serviceClient: SupabaseClient,
  input: { orgId: string; userId: string },
) => Promise<void>;

type PeopleStatusResult =
  | {
      kind: "not_found";
      error: string;
      status: 404;
    }
  | {
      kind: "conflict";
      error: string;
      code: "EMPLOYEE_STATUS_CONFLICT";
      person: MobilePerson;
      status: 409;
    }
  | {
      kind: "self_action_forbidden";
      error: string;
      code: typeof SELF_ACTION_FORBIDDEN_CODE;
      status: 403;
    }
  | {
      kind: "cannot_remove_last_super_admin";
      error: string;
      status: 400;
    }
  | {
      kind: "not_on_schedule";
      error: string;
      status: 400;
    }
  | {
      kind: "invalid_return_date";
      error: string;
      code:
        typeof RETURN_DATE_INVALID_CODE | typeof NOT_AWAY_CODE | typeof AWAY_ABSENCE_INVALID_CODE;
      status: 400;
    }
  | {
      kind: "invalid_status_change";
      error: string;
      code:
        | typeof NOT_SUSPENDABLE_CODE
        | typeof NOT_SUSPENDED_CODE
        | typeof NOT_PLANNABLE_CODE
        | typeof NO_PLANNED_CHANGE_CODE
        | typeof PLANNED_START_INVALID_CODE
        | typeof RETURN_DATE_INVALID_CODE;
      status: 400;
    }
  | {
      kind: "latest_unavailable";
      error: string;
      status: 500;
    }
  | {
      kind: "updated";
      person: MobilePerson;
      status: 200;
    };

export async function updateMobilePersonStatus(
  auth: PeopleStatusContext,
  input: {
    employeeId: string;
    body: MobilePersonStatusUpdateBody;
    requestIp: string | null;
    userAgent: string | null;
  },
  deps: {
    fetchEmployeeById: FetchEmployeeById;
    updateEmployeeStatus: UpdateEmployeeStatus;
    updateEmployeeReturnDate: UpdateEmployeeReturnDate;
    updateEmployeeSuspension: UpdateEmployeeSuspension;
    updateEmployeePlannedChange: UpdateEmployeePlannedChange;
    endAccess: EndAccess;
    insertAuditLog: InsertAuditLog;
    mapEmployeeToMobilePerson: MapEmployeeToMobilePerson;
    fetchActiveMembershipOrgRole: FetchActiveMembershipOrgRole;
    countActiveSuperAdmins: CountActiveSuperAdmins;
    archiveOrganizationMembership: ArchiveOrganizationMembership;
    restoreOrganizationMembership: RestoreOrganizationMembership;
  },
): Promise<PeopleStatusResult> {
  if (!auth.permissions.canManageEmployees) {
    throw new MobileApiAuthorizationError();
  }

  const currentEmployee = await deps.fetchEmployeeById(
    auth.serviceClient,
    auth.currentOrg.id,
    input.employeeId,
  );

  if (!currentEmployee) {
    return {
      kind: "not_found",
      error: "Employee not found",
      status: 404,
    };
  }

  // Self-action guard: you can't change your own staffing status
  // (deactivate / remove / activate). Another admin must act.
  if (isSelfAction(auth.user.id, currentEmployee.userId)) {
    return {
      kind: "self_action_forbidden",
      error: SELF_ACTION_FORBIDDEN_MESSAGE,
      code: SELF_ACTION_FORBIDDEN_CODE,
      status: 403,
    };
  }

  if (currentEmployee.version !== input.body.expectedVersion) {
    return {
      kind: "conflict",
      error: STATUS_CONFLICT_MESSAGE,
      code: "EMPLOYEE_STATUS_CONFLICT",
      person: deps.mapEmployeeToMobilePerson(currentEmployee),
      status: 409,
    };
  }

  if (
    (input.body.action === "deactivate" || input.body.action === "setPlannedChange") &&
    !canMarkInactive(currentEmployee.focusAreaIds)
  ) {
    return { kind: "not_on_schedule", error: NOT_ON_SCHEDULE_MESSAGE, status: 400 };
  }

  const returnDate = input.body.returnDate ?? null;
  const today = getIsoDateInTimeZone(new Date(), auth.currentOrg.timezone ?? null);
  const startDate = input.body.startDate ?? null;
  // A start date after today plans the Away rather than starting it (51g1).
  const planning =
    input.body.action === "setPlannedChange" ||
    (input.body.action === "deactivate" && startDate !== null && startDate !== today);
  if (
    returnDate !== null &&
    (input.body.action === "deactivate" || input.body.action === "setReturnDate") &&
    !isValidReturnDate(returnDate, today)
  ) {
    return {
      kind: "invalid_return_date",
      error: RETURN_DATE_INVALID_MESSAGE,
      code: RETURN_DATE_INVALID_CODE,
      status: 400,
    };
  }

  const absenceTypeId = input.body.absenceTypeId;
  if (
    absenceTypeId != null &&
    (input.body.action === "deactivate" ||
      input.body.action === "setReturnDate" ||
      input.body.action === "setPlannedChange") &&
    returnDate === null
  ) {
    return awayAbsenceInvalid(AWAY_ABSENCE_NEEDS_DATE_MESSAGE);
  }

  if (planning || input.body.action === "cancelPlannedChange") {
    const refusal = planRefusal(
      currentEmployee,
      input.body.action,
      planning,
      startDate,
      returnDate,
      today,
    );
    if (refusal) return refusal;
    try {
      return await changePlan(auth, input, currentEmployee, planning, startDate, returnDate, deps);
    } catch (error) {
      if (isAwayAbsenceRefusal(error)) return awayAbsenceInvalid(AWAY_ABSENCE_UNKNOWN_MESSAGE);
      throw error;
    }
  }

  if (input.body.action === "suspend" || input.body.action === "reinstate") {
    return changeSuspension(auth, input, currentEmployee, deps);
  }

  try {
    if (input.body.action === "setReturnDate") {
      return await setReturnDate(auth, input, currentEmployee, returnDate, deps);
    }
    return await changeStatus(auth, input, currentEmployee, returnDate, deps);
  } catch (error) {
    if (isAwayAbsenceRefusal(error)) return awayAbsenceInvalid(AWAY_ABSENCE_UNKNOWN_MESSAGE);
    throw error;
  }
}

function planRefusal(
  employee: Employee,
  action: MobilePersonStatusUpdateBody["action"],
  planning: boolean,
  startDate: string | null,
  returnDate: string | null,
  today: string,
): PeopleStatusResult | null {
  const refuse = (
    error: string,
    code:
      | typeof NOT_PLANNABLE_CODE
      | typeof NO_PLANNED_CHANGE_CODE
      | typeof PLANNED_START_INVALID_CODE
      | typeof RETURN_DATE_INVALID_CODE,
  ): PeopleStatusResult => ({ kind: "invalid_status_change", error, code, status: 400 });
  if (planning && (employee.status !== "active" || employee.archivedAt || employee.suspendedAt)) {
    return refuse(NOT_PLANNABLE_MESSAGE, NOT_PLANNABLE_CODE);
  }
  if (
    (action === "setPlannedChange" || action === "cancelPlannedChange") &&
    !employee.plannedStatus
  ) {
    return refuse(NO_PLANNED_CHANGE_MESSAGE, NO_PLANNED_CHANGE_CODE);
  }
  if (planning && (startDate === null || !isValidPlannedStart(startDate, today))) {
    return refuse(PLANNED_START_INVALID_MESSAGE, PLANNED_START_INVALID_CODE);
  }
  if (planning && returnDate !== null && startDate !== null && returnDate <= startDate) {
    return refuse(PLANNED_RETURN_INVALID_MESSAGE, RETURN_DATE_INVALID_CODE);
  }
  return null;
}

/** Plans, moves or cancels an Away for a later date (51g1); their status stays Active. */
async function changePlan(
  auth: PeopleStatusContext,
  input: {
    employeeId: string;
    body: MobilePersonStatusUpdateBody;
    requestIp: string | null;
    userAgent: string | null;
  },
  currentEmployee: Employee,
  planning: boolean,
  startDate: string | null,
  returnDate: string | null,
  deps: Parameters<typeof updateMobilePersonStatus>[2],
): Promise<PeopleStatusResult> {
  const action = input.body.action;
  const updatedEmployee = await deps.updateEmployeePlannedChange(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    employeeId: input.employeeId,
    expectedVersion: input.body.expectedVersion,
    plannedStatus: planning ? "away" : null,
    plannedFrom: planning ? startDate : null,
    plannedUntil: planning ? returnDate : null,
    plannedAbsenceTypeId: planning && returnDate ? (input.body.absenceTypeId ?? null) : null,
    ...(action === "deactivate" || input.body.note !== undefined
      ? { plannedNote: input.body.note ?? "" }
      : {}),
    updatedBy: auth.user.id,
  });

  if (!updatedEmployee) {
    const latestEmployee = await deps.fetchEmployeeById(
      auth.serviceClient,
      auth.currentOrg.id,
      input.employeeId,
    );
    if (!latestEmployee) {
      return {
        kind: "latest_unavailable",
        error: "We couldn't load the latest employee state.",
        status: 500,
      };
    }
    return {
      kind: "conflict",
      error: STATUS_CONFLICT_MESSAGE,
      code: "EMPLOYEE_STATUS_CONFLICT",
      person: deps.mapEmployeeToMobilePerson(latestEmployee),
      status: 409,
    };
  }

  await deps.insertAuditLog(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action:
      action === "deactivate"
        ? "employee.away_planned"
        : action === "setPlannedChange"
          ? "employee.away_plan_changed"
          : "employee.away_plan_cancelled",
    resource_type: "employee",
    resource_id: input.employeeId,
    details: planning
      ? {
          ...(action === "setPlannedChange"
            ? {
                fromPlannedFrom: currentEmployee.plannedFrom ?? null,
                fromPlannedUntil: currentEmployee.plannedUntil ?? null,
              }
            : {}),
          plannedFrom: startDate,
          plannedUntil: returnDate,
          ...(input.body.absenceTypeId ? { plannedAbsenceTypeId: input.body.absenceTypeId } : {}),
          changedFields: ["planned_status"],
        }
      : {
          plannedFrom: currentEmployee.plannedFrom ?? null,
          plannedUntil: currentEmployee.plannedUntil ?? null,
          changedFields: ["planned_status"],
        },
    ip_address: input.requestIp,
    user_agent: input.userAgent,
  });

  return {
    kind: "updated",
    person: deps.mapEmployeeToMobilePerson(updatedEmployee),
    status: 200,
  };
}

function awayAbsenceInvalid(error: string): PeopleStatusResult {
  return { kind: "invalid_return_date", error, code: AWAY_ABSENCE_INVALID_CODE, status: 400 };
}

async function changeStatus(
  auth: PeopleStatusContext,
  input: {
    employeeId: string;
    body: MobilePersonStatusUpdateBody;
    requestIp: string | null;
    userAgent: string | null;
  },
  currentEmployee: Employee,
  returnDate: string | null,
  deps: Parameters<typeof updateMobilePersonStatus>[2],
): Promise<PeopleStatusResult> {
  // Removing staff already fully blocks login at the JWT hook regardless of
  // org_role, so removing the org's only super_admin here would lock the org
  // out just as surely as deleting their membership would — same guard as
  // DELETE /api/organizations/access on web.
  if (input.body.action === "remove" && currentEmployee.userId) {
    const targetOrgRole = await deps.fetchActiveMembershipOrgRole(
      auth.serviceClient,
      auth.currentOrg.id,
      currentEmployee.userId,
    );

    if (targetOrgRole === "super_admin") {
      const superAdminCount = await deps.countActiveSuperAdmins(
        auth.serviceClient,
        auth.currentOrg.id,
      );

      if (superAdminCount <= 1) {
        return {
          kind: "cannot_remove_last_super_admin",
          error: "Cannot remove the only super admin. Transfer ownership first.",
          status: 400,
        };
      }
    }
  }

  const now = new Date().toISOString();
  const nextStatus =
    input.body.action === "deactivate"
      ? "inactive"
      : input.body.action === "remove"
        ? "removed"
        : "active";
  const nextStatusNote = input.body.action === "deactivate" ? (input.body.note ?? "") : "";
  const action =
    input.body.action === "deactivate"
      ? "employee.deactivated"
      : input.body.action === "remove"
        ? "employee.removed"
        : "employee.activated";

  const updatedEmployee = await deps.updateEmployeeStatus(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    employeeId: input.employeeId,
    expectedVersion: input.body.expectedVersion,
    status: nextStatus,
    statusNote: nextStatusNote,
    statusChangedAt: now,
    archivedAt:
      input.body.action === "activate" ? null : input.body.action === "remove" ? now : undefined,
    awayUntil: input.body.action === "deactivate" ? returnDate : null,
    awayAbsenceTypeId:
      input.body.action === "deactivate" ? (input.body.absenceTypeId ?? null) : null,
    updatedBy: auth.user.id,
  });

  if (!updatedEmployee) {
    const latestEmployee = await deps.fetchEmployeeById(
      auth.serviceClient,
      auth.currentOrg.id,
      input.employeeId,
    );

    if (!latestEmployee) {
      return {
        kind: "latest_unavailable",
        error: "We couldn't load the latest employee state.",
        status: 500,
      };
    }

    return {
      kind: "conflict",
      error: STATUS_CONFLICT_MESSAGE,
      code: "EMPLOYEE_STATUS_CONFLICT",
      person: deps.mapEmployeeToMobilePerson(latestEmployee),
      status: 409,
    };
  }

  // Remove/activate a linked user's org membership in lockstep with their
  // employees.status, in the same request that already committed the status
  // change — not a second, separately-triggered call — so the two can't
  // diverge. Gated to super_admin (gridmaster mobile access is blocked
  // entirely at auth resolution) — the same tier DELETE
  // /api/organizations/access requires on web.
  if (
    (input.body.action === "remove" || input.body.action === "activate") &&
    currentEmployee.userId &&
    auth.permissions.isSuperAdmin
  ) {
    if (input.body.action === "remove") {
      await deps.archiveOrganizationMembership(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        userId: currentEmployee.userId,
        archivedByUserId: auth.user.id,
        archivedAt: now,
      });
    } else {
      await deps.restoreOrganizationMembership(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        userId: currentEmployee.userId,
      });
    }
  }

  await deps.insertAuditLog(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action,
    resource_type: "employee",
    resource_id: input.employeeId,
    details: {
      fromStatus: currentEmployee.status,
      toStatus: updatedEmployee.status,
      note: input.body.note ?? "",
      ...(updatedEmployee.awayUntil ? { awayUntil: updatedEmployee.awayUntil } : {}),
      ...(updatedEmployee.awayAbsenceTypeId
        ? { awayAbsenceTypeId: updatedEmployee.awayAbsenceTypeId }
        : {}),
      changedFields: ["status"],
    },
    ip_address: input.requestIp,
    user_agent: input.userAgent,
  });

  return {
    kind: "updated",
    person: deps.mapEmployeeToMobilePerson(updatedEmployee),
    status: 200,
  };
}

/** Sets, moves or clears an Away person's return date; their status stays Away. */
async function setReturnDate(
  auth: PeopleStatusContext,
  input: {
    employeeId: string;
    body: MobilePersonStatusUpdateBody;
    requestIp: string | null;
    userAgent: string | null;
  },
  currentEmployee: Employee,
  returnDate: string | null,
  deps: {
    fetchEmployeeById: FetchEmployeeById;
    updateEmployeeReturnDate: UpdateEmployeeReturnDate;
    insertAuditLog: InsertAuditLog;
    mapEmployeeToMobilePerson: MapEmployeeToMobilePerson;
  },
): Promise<PeopleStatusResult> {
  if (currentEmployee.status !== "inactive" || currentEmployee.archivedAt) {
    return {
      kind: "invalid_return_date",
      error: NOT_AWAY_MESSAGE,
      code: NOT_AWAY_CODE,
      status: 400,
    };
  }

  const updatedEmployee = await deps.updateEmployeeReturnDate(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    employeeId: input.employeeId,
    expectedVersion: input.body.expectedVersion,
    awayUntil: returnDate,
    awayAbsenceTypeId:
      input.body.absenceTypeId === undefined
        ? (currentEmployee.awayAbsenceTypeId ?? null)
        : input.body.absenceTypeId,
    updatedBy: auth.user.id,
  });

  if (!updatedEmployee) {
    const latestEmployee = await deps.fetchEmployeeById(
      auth.serviceClient,
      auth.currentOrg.id,
      input.employeeId,
    );
    if (!latestEmployee) {
      return {
        kind: "latest_unavailable",
        error: "We couldn't load the latest employee state.",
        status: 500,
      };
    }
    return {
      kind: "conflict",
      error: STATUS_CONFLICT_MESSAGE,
      code: "EMPLOYEE_STATUS_CONFLICT",
      person: deps.mapEmployeeToMobilePerson(latestEmployee),
      status: 409,
    };
  }

  await deps.insertAuditLog(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action: "employee.return_date_changed",
    resource_type: "employee",
    resource_id: input.employeeId,
    details: {
      fromAwayUntil: currentEmployee.awayUntil ?? null,
      toAwayUntil: returnDate,
      ...((updatedEmployee.awayAbsenceTypeId ?? null) !==
      (currentEmployee.awayAbsenceTypeId ?? null)
        ? {
            fromAwayAbsenceTypeId: currentEmployee.awayAbsenceTypeId ?? null,
            toAwayAbsenceTypeId: updatedEmployee.awayAbsenceTypeId ?? null,
          }
        : {}),
      changedFields: ["away_until"],
    },
    ip_address: input.requestIp,
    user_agent: input.userAgent,
  });

  return {
    kind: "updated",
    person: deps.mapEmployeeToMobilePerson(updatedEmployee),
    status: 200,
  };
}

/**
 * Suspends someone (51c), signing them out everywhere and stopping their
 * push, or reinstates them. They stay Active either way.
 */
async function changeSuspension(
  auth: PeopleStatusContext,
  input: {
    employeeId: string;
    body: MobilePersonStatusUpdateBody;
    requestIp: string | null;
    userAgent: string | null;
  },
  currentEmployee: Employee,
  deps: Parameters<typeof updateMobilePersonStatus>[2],
): Promise<PeopleStatusResult> {
  const suspending = input.body.action === "suspend";
  if (
    suspending &&
    (currentEmployee.status !== "active" ||
      currentEmployee.archivedAt ||
      currentEmployee.suspendedAt)
  ) {
    return {
      kind: "invalid_status_change",
      error: NOT_SUSPENDABLE_MESSAGE,
      code: NOT_SUSPENDABLE_CODE,
      status: 400,
    };
  }
  if (!suspending && !currentEmployee.suspendedAt) {
    return {
      kind: "invalid_status_change",
      error: NOT_SUSPENDED_MESSAGE,
      code: NOT_SUSPENDED_CODE,
      status: 400,
    };
  }

  if (suspending && currentEmployee.userId) {
    const targetOrgRole = await deps.fetchActiveMembershipOrgRole(
      auth.serviceClient,
      auth.currentOrg.id,
      currentEmployee.userId,
    );
    if (
      targetOrgRole === "super_admin" &&
      (await deps.countActiveSuperAdmins(auth.serviceClient, auth.currentOrg.id)) <= 1
    ) {
      return {
        kind: "cannot_remove_last_super_admin",
        error: "Cannot suspend the only super admin. Transfer ownership first.",
        status: 400,
      };
    }
  }

  const updatedEmployee = await deps.updateEmployeeSuspension(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    employeeId: input.employeeId,
    expectedVersion: input.body.expectedVersion,
    suspended: suspending,
    updatedBy: auth.user.id,
  });

  if (!updatedEmployee) {
    const latestEmployee = await deps.fetchEmployeeById(
      auth.serviceClient,
      auth.currentOrg.id,
      input.employeeId,
    );
    if (!latestEmployee) {
      return {
        kind: "latest_unavailable",
        error: "We couldn't load the latest employee state.",
        status: 500,
      };
    }
    return {
      kind: "conflict",
      error: STATUS_CONFLICT_MESSAGE,
      code: "EMPLOYEE_STATUS_CONFLICT",
      person: deps.mapEmployeeToMobilePerson(latestEmployee),
      status: 409,
    };
  }

  if (suspending && currentEmployee.userId) {
    await deps.endAccess(auth.serviceClient, {
      userId: currentEmployee.userId,
      orgId: auth.currentOrg.id,
    });
  }

  await deps.insertAuditLog(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action: suspending ? "employee.suspended" : "employee.reinstated",
    resource_type: "employee",
    resource_id: input.employeeId,
    details: { changedFields: ["suspended_at"] },
    ip_address: input.requestIp,
    user_agent: input.userAgent,
  });

  return {
    kind: "updated",
    person: deps.mapEmployeeToMobilePerson(updatedEmployee),
    status: 200,
  };
}
