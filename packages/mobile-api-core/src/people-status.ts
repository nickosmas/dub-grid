import type { MobilePerson, MobilePersonStatusUpdateBody } from "@dubgrid/contracts";
import type { Employee } from "@dubgrid/domain";
import {
  AWAY_ABSENCE_INVALID_CODE,
  AWAY_ABSENCE_NEEDS_DATE_MESSAGE,
  AWAY_ABSENCE_UNKNOWN_MESSAGE,
  canMarkInactive,
  canOffboardAtTier,
  isAwayAbsenceRefusal,
  isSelfAction,
  isValidLastDay,
  isValidPlannedStart,
  isValidReturnDate,
  LAST_DAY_INVALID_CODE,
  LAST_DAY_INVALID_MESSAGE,
  plannedFromForLastDay,
  plannedLastDay,
  NO_PLANNED_CHANGE_CODE,
  NO_PLANNED_CHANGE_MESSAGE,
  NOT_AWAY_CODE,
  NOT_AWAY_MESSAGE,
  NOT_ON_SCHEDULE_MESSAGE,
  NOT_PLANNABLE_CODE,
  NOT_PLANNABLE_MESSAGE,
  NOT_SUSPENDABLE_CODE,
  NOT_SUSPENDABLE_MESSAGE,
  NO_ACCOUNT_CODE,
  NO_ACCOUNT_MESSAGE,
  NOT_SUSPENDED_CODE,
  NOT_SUSPENDED_MESSAGE,
  OFFBOARD_OUT_OF_REACH_CODE,
  OFFBOARD_OUT_OF_REACH_MESSAGE,
  RESTORE_OUT_OF_REACH_MESSAGE,
  RETURN_DATE_INVALID_CODE,
  RETURN_DATE_INVALID_MESSAGE,
  PLANNED_RETURN_INVALID_MESSAGE,
  PLANNED_START_INVALID_CODE,
  PLANNED_START_INVALID_MESSAGE,
  PLANNED_SUSPENSION_END_INVALID_MESSAGE,
  SUSPENDED_UNTIL_INVALID_CODE,
  SUSPENDED_UNTIL_INVALID_MESSAGE,
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
    // Only a Super Admin offboards or restores a Super Admin (51k), as on web.
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
    /** Suspending: the first day with access again (51g3), or null. */
    suspendedUntil?: string | null;
    updatedBy: string;
  },
) => Promise<Employee | null>;

type UpdateEmployeeSuspendedUntil = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId: string;
    expectedVersion: number;
    suspendedUntil: string | null;
    updatedBy: string;
  },
) => Promise<Employee | null>;

type UpdateEmployeePlannedChange = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId: string;
    expectedVersion: number;
    plannedStatus: "away" | "removed" | "suspended" | null;
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

type FetchMembershipOrgRole = (
  serviceClient: SupabaseClient,
  orgId: string,
  userId: string,
) => Promise<string | null>;

/** After an Offboard: their sessions end and their membership is archived, never throwing. */
type EndOffboardedAccess = (
  serviceClient: SupabaseClient,
  input: { orgId: string; empId: string; userId: string; actorId: string; at: string },
) => Promise<void>;

/** After a Restore: their archived membership is reopened, never throwing. */
type ReopenRestoredAccess = (
  serviceClient: SupabaseClient,
  input: { orgId: string; empId: string; userId: string },
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
      kind: "out_of_reach";
      error: string;
      code: typeof OFFBOARD_OUT_OF_REACH_CODE;
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
        | typeof NO_ACCOUNT_CODE
        | typeof NOT_SUSPENDED_CODE
        | typeof NOT_PLANNABLE_CODE
        | typeof NO_PLANNED_CHANGE_CODE
        | typeof PLANNED_START_INVALID_CODE
        | typeof LAST_DAY_INVALID_CODE
        | typeof SUSPENDED_UNTIL_INVALID_CODE
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
    updateEmployeeSuspendedUntil: UpdateEmployeeSuspendedUntil;
    updateEmployeePlannedChange: UpdateEmployeePlannedChange;
    endAccess: EndAccess;
    insertAuditLog: InsertAuditLog;
    mapEmployeeToMobilePerson: MapEmployeeToMobilePerson;
    fetchActiveMembershipOrgRole: FetchActiveMembershipOrgRole;
    countActiveSuperAdmins: CountActiveSuperAdmins;
    fetchMembershipOrgRole: FetchMembershipOrgRole;
    endOffboardedAccess: EndOffboardedAccess;
    reopenRestoredAccess: ReopenRestoredAccess;
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

  const outOfReach = await tierRefusal(auth, input.body.action, currentEmployee, deps);
  if (outOfReach) return outOfReach;

  // A planned last day (51g2) or suspension (51g3) is edited through the same
  // action as a planned Away.
  const editingLastDay =
    input.body.action === "setPlannedChange" && currentEmployee.plannedStatus === "removed";
  const editingSuspension =
    input.body.action === "setPlannedChange" && currentEmployee.plannedStatus === "suspended";
  if (
    (input.body.action === "deactivate" ||
      (input.body.action === "setPlannedChange" && !editingLastDay && !editingSuspension)) &&
    !canMarkInactive(currentEmployee.focusAreaIds)
  ) {
    return { kind: "not_on_schedule", error: NOT_ON_SCHEDULE_MESSAGE, status: 400 };
  }

  const returnDate = input.body.returnDate ?? null;
  const today = getIsoDateInTimeZone(new Date(), auth.currentOrg.timezone ?? null);
  const startDate = input.body.startDate ?? null;
  const lastDay = input.body.lastDay ?? null;
  // A start date after today plans an Away (51g1) or a suspension (51g3)
  // rather than starting it, and a last day plans the Offboard for the day
  // after it (51g2).
  const laterStart = startDate !== null && startDate !== today;
  const planningLastDay = (input.body.action === "remove" && lastDay !== null) || editingLastDay;
  const planningSuspension = (input.body.action === "suspend" && laterStart) || editingSuspension;
  const planning =
    planningLastDay ||
    planningSuspension ||
    input.body.action === "setPlannedChange" ||
    (input.body.action === "deactivate" && laterStart);
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
    const refusal = planningLastDay
      ? lastDayRefusal(currentEmployee, lastDay, today)
      : (suspensionRefusal(currentEmployee, input.body.action) ??
        planRefusal(currentEmployee, input.body.action, planning, startDate, returnDate, today, {
          suspension: planningSuspension,
        }));
    if (refusal) return refusal;
    if (input.body.action === "remove") {
      const lastSuperAdmin = await lastSuperAdminRefusal(auth, currentEmployee, deps);
      if (lastSuperAdmin) return lastSuperAdmin;
    }
    if (input.body.action === "suspend") {
      const lastSuperAdmin = await lastSuperAdminSuspensionRefusal(auth, currentEmployee, deps);
      if (lastSuperAdmin) return lastSuperAdmin;
    }
    try {
      if (planningSuspension) {
        return await changePlan(
          auth,
          input,
          currentEmployee,
          { kind: "suspension", startDate: startDate as string, until: returnDate },
          deps,
        );
      }
      if (planningLastDay) {
        return await changePlan(
          auth,
          input,
          currentEmployee,
          { kind: "lastDay", lastDay: lastDay as string },
          deps,
        );
      }
      return await changePlan(
        auth,
        input,
        currentEmployee,
        planning ? { kind: "away", startDate, returnDate } : null,
        deps,
      );
    } catch (error) {
      if (isAwayAbsenceRefusal(error)) return awayAbsenceInvalid(AWAY_ABSENCE_UNKNOWN_MESSAGE);
      throw error;
    }
  }

  if (
    returnDate !== null &&
    (input.body.action === "suspend" || input.body.action === "setSuspendedUntil") &&
    !isValidReturnDate(returnDate, today)
  ) {
    return {
      kind: "invalid_status_change",
      error: SUSPENDED_UNTIL_INVALID_MESSAGE,
      code: SUSPENDED_UNTIL_INVALID_CODE,
      status: 400,
    };
  }

  if (input.body.action === "setSuspendedUntil") {
    return setSuspendedUntil(auth, input, currentEmployee, returnDate, deps);
  }

  if (input.body.action === "suspend" || input.body.action === "reinstate") {
    return changeSuspension(auth, input, currentEmployee, returnDate, deps);
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

/**
 * Offboarding ends a membership and Restore reopens one (51k), so only a
 * Super Admin offboards, plans a last day for or restores a Super Admin.
 */
async function tierRefusal(
  auth: PeopleStatusContext,
  action: MobilePersonStatusUpdateBody["action"],
  employee: Employee,
  deps: Parameters<typeof updateMobilePersonStatus>[2],
): Promise<PeopleStatusResult | null> {
  const restoring = action === "activate" && employee.status === "removed";
  const offboarding =
    action === "remove" || (action === "setPlannedChange" && employee.plannedStatus === "removed");
  if (!(offboarding || restoring) || auth.permissions.isSuperAdmin || !employee.userId) {
    return null;
  }
  const role = await deps.fetchMembershipOrgRole(
    auth.serviceClient,
    auth.currentOrg.id,
    employee.userId,
  );
  if (canOffboardAtTier({ isSuperAdmin: false, isGridmaster: false }, role)) return null;
  return {
    kind: "out_of_reach",
    error: restoring ? RESTORE_OUT_OF_REACH_MESSAGE : OFFBOARD_OUT_OF_REACH_MESSAGE,
    code: OFFBOARD_OUT_OF_REACH_CODE,
    status: 403,
  };
}

/** A suspension planned for later (51g3) needs what Suspend needs: an account, and someone suspendable. */
function suspensionRefusal(
  employee: Employee,
  action: MobilePersonStatusUpdateBody["action"],
): PeopleStatusResult | null {
  if (action !== "suspend") return null;
  if (employee.status !== "active" || employee.archivedAt || employee.suspendedAt) {
    return {
      kind: "invalid_status_change",
      error: NOT_SUSPENDABLE_MESSAGE,
      code: NOT_SUSPENDABLE_CODE,
      status: 400,
    };
  }
  if (!employee.userId) {
    return {
      kind: "invalid_status_change",
      error: NO_ACCOUNT_MESSAGE,
      code: NO_ACCOUNT_CODE,
      status: 400,
    };
  }
  return null;
}

function planRefusal(
  employee: Employee,
  action: MobilePersonStatusUpdateBody["action"],
  planning: boolean,
  startDate: string | null,
  returnDate: string | null,
  today: string,
  { suspension = false }: { suspension?: boolean } = {},
): PeopleStatusResult | null {
  const refuse = (
    error: string,
    code:
      | typeof NOT_PLANNABLE_CODE
      | typeof NO_PLANNED_CHANGE_CODE
      | typeof PLANNED_START_INVALID_CODE
      | typeof SUSPENDED_UNTIL_INVALID_CODE
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
    return suspension
      ? refuse(PLANNED_SUSPENSION_END_INVALID_MESSAGE, SUSPENDED_UNTIL_INVALID_CODE)
      : refuse(PLANNED_RETURN_INVALID_MESSAGE, RETURN_DATE_INVALID_CODE);
  }
  return null;
}

function lastDayRefusal(
  employee: Employee,
  lastDay: string | null,
  today: string,
): PeopleStatusResult | null {
  if (employee.status !== "active" || employee.archivedAt || employee.suspendedAt) {
    return {
      kind: "invalid_status_change",
      error: NOT_PLANNABLE_MESSAGE,
      code: NOT_PLANNABLE_CODE,
      status: 400,
    };
  }
  if (lastDay === null || !isValidLastDay(lastDay, today)) {
    return {
      kind: "invalid_status_change",
      error: LAST_DAY_INVALID_MESSAGE,
      code: LAST_DAY_INVALID_CODE,
      status: 400,
    };
  }
  return null;
}

/**
 * Offboarding blocks login at the JWT hook regardless of org_role, so
 * offboarding the org's only super_admin, now or on a last day, would lock
 * the org out; the same guard as DELETE /api/organizations/access on web.
 */
async function lastSuperAdminRefusal(
  auth: PeopleStatusContext,
  currentEmployee: Employee,
  deps: Parameters<typeof updateMobilePersonStatus>[2],
): Promise<PeopleStatusResult | null> {
  if (!currentEmployee.userId) return null;
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
      error: "Cannot remove the only super admin. Transfer ownership first.",
      status: 400,
    };
  }
  return null;
}

type PlanChange =
  | { kind: "away"; startDate: string | null; returnDate: string | null }
  | { kind: "lastDay"; lastDay: string }
  | { kind: "suspension"; startDate: string; until: string | null }
  | null;

/**
 * Plans, moves or cancels (null) an Away for a later date (51g1) or a last
 * day (51g2); their status stays Active until the day.
 */
async function changePlan(
  auth: PeopleStatusContext,
  input: {
    employeeId: string;
    body: MobilePersonStatusUpdateBody;
    requestIp: string | null;
    userAgent: string | null;
  },
  currentEmployee: Employee,
  plan: PlanChange,
  deps: Parameters<typeof updateMobilePersonStatus>[2],
): Promise<PeopleStatusResult> {
  const action = input.body.action;
  const away = plan?.kind === "away" ? plan : null;
  const suspension = plan?.kind === "suspension" ? plan : null;
  const updatedEmployee = await deps.updateEmployeePlannedChange(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    employeeId: input.employeeId,
    expectedVersion: input.body.expectedVersion,
    plannedStatus:
      plan?.kind === "lastDay" ? "removed" : suspension ? "suspended" : away ? "away" : null,
    plannedFrom:
      plan?.kind === "lastDay"
        ? plannedFromForLastDay(plan.lastDay)
        : (suspension?.startDate ?? away?.startDate ?? null),
    plannedUntil: suspension ? suspension.until : (away?.returnDate ?? null),
    plannedAbsenceTypeId: away?.returnDate ? (input.body.absenceTypeId ?? null) : null,
    ...(action === "deactivate" || action === "remove" || input.body.note !== undefined
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

  const wasLastDay = currentEmployee.plannedStatus === "removed";
  const wasSuspension = currentEmployee.plannedStatus === "suspended";
  await deps.insertAuditLog(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action: suspension
      ? action === "suspend"
        ? "employee.suspension_planned"
        : "employee.suspension_plan_changed"
      : plan?.kind === "lastDay"
        ? action === "remove"
          ? "employee.last_day_set"
          : "employee.last_day_changed"
        : action === "deactivate"
          ? "employee.away_planned"
          : action === "setPlannedChange"
            ? "employee.away_plan_changed"
            : wasLastDay
              ? "employee.last_day_cancelled"
              : wasSuspension
                ? "employee.suspension_plan_cancelled"
                : "employee.away_plan_cancelled",
    resource_type: "employee",
    resource_id: input.employeeId,
    details: suspension
      ? {
          ...(action === "setPlannedChange"
            ? {
                fromPlannedFrom: currentEmployee.plannedFrom ?? null,
                fromPlannedUntil: currentEmployee.plannedUntil ?? null,
              }
            : {}),
          plannedFrom: suspension.startDate,
          plannedUntil: suspension.until,
          changedFields: ["planned_status"],
        }
      : plan?.kind === "lastDay"
        ? {
            ...(action === "setPlannedChange"
              ? { fromLastDay: plannedLastDay(currentEmployee) }
              : {}),
            lastDay: plan.lastDay,
            changedFields: ["planned_status"],
          }
        : away
          ? {
              ...(action === "setPlannedChange"
                ? {
                    fromPlannedFrom: currentEmployee.plannedFrom ?? null,
                    fromPlannedUntil: currentEmployee.plannedUntil ?? null,
                  }
                : {}),
              plannedFrom: away.startDate,
              plannedUntil: away.returnDate,
              ...(input.body.absenceTypeId
                ? { plannedAbsenceTypeId: input.body.absenceTypeId }
                : {}),
              changedFields: ["planned_status"],
            }
          : wasLastDay
            ? { lastDay: plannedLastDay(currentEmployee), changedFields: ["planned_status"] }
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
  if (input.body.action === "remove") {
    const refusal = await lastSuperAdminRefusal(auth, currentEmployee, deps);
    if (refusal) return refusal;
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

  // The membership follows the employee row in the same request, whoever
  // acts (51k): Offboard ends their sessions and archives it, Restore
  // reopens it.
  if (currentEmployee.userId && input.body.action === "remove") {
    await deps.endOffboardedAccess(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      empId: input.employeeId,
      userId: currentEmployee.userId,
      actorId: auth.user.id,
      at: now,
    });
  }
  if (
    currentEmployee.userId &&
    input.body.action === "activate" &&
    currentEmployee.status === "removed"
  ) {
    await deps.reopenRestoredAccess(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      empId: input.employeeId,
      userId: currentEmployee.userId,
    });
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

/** Suspending the org's only super_admin would lock the org out, now or on a later start. */
async function lastSuperAdminSuspensionRefusal(
  auth: PeopleStatusContext,
  currentEmployee: Employee,
  deps: Parameters<typeof updateMobilePersonStatus>[2],
): Promise<PeopleStatusResult | null> {
  if (!currentEmployee.userId) return null;
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
  return null;
}

/** Sets, moves or clears a suspended person's end date (51g3); they stay suspended. */
async function setSuspendedUntil(
  auth: PeopleStatusContext,
  input: {
    employeeId: string;
    body: MobilePersonStatusUpdateBody;
    requestIp: string | null;
    userAgent: string | null;
  },
  currentEmployee: Employee,
  suspendedUntil: string | null,
  deps: Parameters<typeof updateMobilePersonStatus>[2],
): Promise<PeopleStatusResult> {
  if (!currentEmployee.suspendedAt) {
    return {
      kind: "invalid_status_change",
      error: NOT_SUSPENDED_MESSAGE,
      code: NOT_SUSPENDED_CODE,
      status: 400,
    };
  }
  const updatedEmployee = await deps.updateEmployeeSuspendedUntil(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    employeeId: input.employeeId,
    expectedVersion: input.body.expectedVersion,
    suspendedUntil,
    updatedBy: auth.user.id,
  });
  if (!updatedEmployee) return conflictOrMissing(auth, input.employeeId, deps);

  await deps.insertAuditLog(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action: "employee.suspension_end_changed",
    resource_type: "employee",
    resource_id: input.employeeId,
    details: {
      fromSuspendedUntil: currentEmployee.suspendedUntil ?? null,
      toSuspendedUntil: suspendedUntil,
      changedFields: ["suspended_until"],
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

/** The latest row after a version-guarded update matched nothing. */
async function conflictOrMissing(
  auth: PeopleStatusContext,
  employeeId: string,
  deps: Parameters<typeof updateMobilePersonStatus>[2],
): Promise<PeopleStatusResult> {
  const latestEmployee = await deps.fetchEmployeeById(
    auth.serviceClient,
    auth.currentOrg.id,
    employeeId,
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

/**
 * Suspends someone (51c), signing them out everywhere and stopping their
 * push, until `suspendedUntil` when set (51g3), or reinstates them. They stay
 * Active either way.
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
  suspendedUntil: string | null,
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
  if (suspending && !currentEmployee.userId) {
    return {
      kind: "invalid_status_change",
      error: NO_ACCOUNT_MESSAGE,
      code: NO_ACCOUNT_CODE,
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

  if (suspending) {
    const refusal = await lastSuperAdminSuspensionRefusal(auth, currentEmployee, deps);
    if (refusal) return refusal;
  }

  const updatedEmployee = await deps.updateEmployeeSuspension(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    employeeId: input.employeeId,
    expectedVersion: input.body.expectedVersion,
    suspended: suspending,
    ...(suspending ? { suspendedUntil } : {}),
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
    details: {
      ...(suspending && suspendedUntil ? { suspendedUntil } : {}),
      changedFields: ["suspended_at"],
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
