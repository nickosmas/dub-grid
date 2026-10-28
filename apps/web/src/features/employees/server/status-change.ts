import type { getServiceClient } from "@/lib/supabase-service";
import { endUserSessions } from "@/lib/auth/revocation";
import {
  endOffboardedAccess,
  reopenRestoredAccess,
} from "@/features/employees/server/offboard-access";
import { disableMobilePushTokensForOrg } from "@dubgrid/data-access";
import logger from "@/lib/logger";
import { scheduleSuspensionNotice } from "@/features/employees/server/suspension-notice";
import { rowToEmployee } from "@/lib/db/mappers";
import type { DbEmployee } from "@/lib/db/types";
import { EMPLOYEE_COLS } from "@/lib/db/shared";
import {
  AWAY_ABSENCE_INVALID_CODE,
  AWAY_ABSENCE_NEEDS_DATE_MESSAGE,
  AWAY_ABSENCE_UNKNOWN_MESSAGE,
  bulkStatusSkipReason,
  canMarkInactive,
  canOffboardAtTier,
  isAwayAbsenceRefusal,
  isValidLastDay,
  isValidPlannedStart,
  isValidReturnDate,
  LAST_DAY_INVALID_CODE,
  LAST_DAY_INVALID_MESSAGE,
  plannedFromForLastDay,
  plannedLastDay,
  NO_PLANNED_CHANGE_CODE,
  NO_PLANNED_CHANGE_MESSAGE,
  OFFBOARD_OUT_OF_REACH_CODE,
  OFFBOARD_OUT_OF_REACH_MESSAGE,
  RESTORE_OUT_OF_REACH_MESSAGE,
  NOT_AWAY_CODE,
  NOT_AWAY_MESSAGE,
  NOT_ON_SCHEDULE_CODE,
  NOT_ON_SCHEDULE_MESSAGE,
  NOT_PLANNABLE_CODE,
  NOT_PLANNABLE_MESSAGE,
  NOT_SUSPENDABLE_CODE,
  NOT_SUSPENDABLE_MESSAGE,
  NO_ACCOUNT_CODE,
  NO_ACCOUNT_MESSAGE,
  NOT_SUSPENDED_CODE,
  NOT_SUSPENDED_MESSAGE,
  RETURN_DATE_INVALID_CODE,
  RETURN_DATE_INVALID_MESSAGE,
  PLANNED_RETURN_INVALID_MESSAGE,
  PLANNED_START_INVALID_CODE,
  PLANNED_START_INVALID_MESSAGE,
  PLANNED_SUSPENSION_END_INVALID_MESSAGE,
  STATUS_NOT_APPLICABLE_CODE,
  SUSPENDED_UNTIL_INVALID_CODE,
  SUSPENDED_UNTIL_INVALID_MESSAGE,
  SELF_ACTION_FORBIDDEN_CODE,
  SELF_ACTION_FORBIDDEN_MESSAGE,
  type BulkStatusAction,
} from "@dubgrid/domain";
import { fetchOrgToday } from "@/features/employees/server/org-today";

export const STATUS_CHANGE_ACTIONS = [
  "deactivate",
  "activate",
  "remove",
  "setReturnDate",
  "suspend",
  "reinstate",
  "setSuspendedUntil",
  "setPlannedChange",
  "cancelPlannedChange",
] as const;

export const ONLY_SUPER_ADMIN_MESSAGE =
  "They're the only Super Admin who can sign in. Transfer ownership first.";

export type StatusChangeAction = (typeof STATUS_CHANGE_ACTIONS)[number];

/** Actions that take a staff record out of the organization, so a Gridmaster needs fresh proof (F-96). */
export function statusChangeNeedsFreshProof(action: StatusChangeAction): boolean {
  return (
    action === "deactivate" ||
    action === "remove" ||
    action === "suspend" ||
    action === "setPlannedChange"
  );
}

export interface StatusChangeInput {
  empId: string;
  action: StatusChangeAction;
  expectedVersion: number;
  note?: string;
  returnDate: string | null;
  absenceTypeId?: number | null;
  startDate: string | null;
  lastDay: string | null;
}

export interface StatusChangeContext {
  serviceClient: ReturnType<typeof getServiceClient>;
  /** The effective (sandbox-aware) organization. */
  orgId: string;
  actor: { id: string; email?: string | null; isGridmaster: boolean; isSuperAdmin: boolean };
  request: { ipAddress: string | null; userAgent: string | null };
  /** Set for a bulk change (51h): a person it doesn't apply to is refused. */
  bulkAction?: BulkStatusAction;
}

/** One person's outcome in a bulk change (51h). */
export interface BulkStatusResult {
  empId: string;
  ok: boolean;
  /** The saved row, or the latest one when it changed elsewhere. */
  employee?: unknown;
  error?: string;
  code?: string;
}

/** What the route answers: an HTTP status and its JSON body. */
export interface StatusChangeResult {
  status: number;
  body: Record<string, unknown>;
}

/** The caller's tier in this organization, once a route has checked they can manage staff. */
export async function loadStatusTier(
  serviceClient: StatusChangeContext["serviceClient"],
  userId: string,
  orgId: string,
): Promise<{ isGridmaster: boolean; isSuperAdmin: boolean }> {
  const [{ data: membership }, { data: profile }] = await Promise.all([
    serviceClient
      .from("organization_memberships")
      .select("org_role, admin_permissions")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .maybeSingle(),
    serviceClient.from("profiles").select("platform_role").eq("id", userId).single(),
  ]);
  return {
    isGridmaster: profile?.platform_role === "gridmaster",
    isSuperAdmin: membership?.org_role === "super_admin",
  };
}

/** The caller's address and browser, for the audit row. */
export function requestInfo(req: Request): StatusChangeContext["request"] {
  const forwarded = req.headers.get("x-forwarded-for");
  return {
    ipAddress: forwarded?.split(",")[0]?.trim() || null,
    userAgent: req.headers.get("user-agent"),
  };
}

function respond(body: Record<string, unknown>, init?: { status: number }): StatusChangeResult {
  return { status: init?.status ?? 200, body };
}

function buildConflictResponse(employee: ReturnType<typeof rowToEmployee>): StatusChangeResult {
  return respond(
    {
      error: "Employee status changed elsewhere. Review the latest values before saving again.",
      code: "EMPLOYEE_STATUS_CONFLICT",
      employee,
    },
    { status: 409 },
  );
}

/**
 * True when a Super Admin other than this person can still sign in: not
 * suspended and not offboarded here. Without it, one bulk could suspend or
 * offboard every Super Admin one after another (51h).
 */
async function anotherSuperAdminCanSignIn(
  serviceClient: StatusChangeContext["serviceClient"],
  orgId: string,
  userId: string,
): Promise<boolean> {
  const { data: superAdmins, error } = await serviceClient
    .from("organization_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("org_role", "super_admin")
    .is("archived_at", null);
  if (error) throw error;
  const others = ((superAdmins ?? []) as { user_id: string }[])
    .map((row) => row.user_id)
    .filter((id) => id !== userId);
  if (others.length === 0) return false;
  const { data: blocked, error: blockedError } = await serviceClient
    .from("employees")
    .select("user_id")
    .eq("org_id", orgId)
    .in("user_id", others)
    .or("status.eq.removed,suspended_at.not.is.null");
  if (blockedError) throw blockedError;
  const cannotSignIn = new Set(
    ((blocked ?? []) as { user_id: string }[]).map((row) => row.user_id),
  );
  return others.some((id) => !cannotSignIn.has(id));
}

/**
 * One person's status change, with every guard, its side effects and its
 * audit row. Shared by the single and bulk status routes so both enforce the
 * same rules. Throws on an unexpected database error.
 */
export async function applyStatusChange(
  { serviceClient, orgId, actor, request, bulkAction }: StatusChangeContext,
  {
    empId,
    action,
    expectedVersion,
    note,
    returnDate,
    absenceTypeId,
    startDate,
    lastDay,
  }: StatusChangeInput,
): Promise<StatusChangeResult> {
  const { isGridmaster, isSuperAdmin } = actor;
  const { data: currentRow, error: currentError } = await serviceClient
    .from("employees")
    .select(EMPLOYEE_COLS)
    .eq("id", empId)
    .eq("org_id", orgId)
    .single();

  if (currentError) throw currentError;

  const currentEmployee = rowToEmployee(currentRow as DbEmployee);

  // Self-action guard: you cannot change your own staffing status
  // (bench / terminate / activate). Another admin must act.
  if (currentEmployee.userId === actor.id) {
    return respond(
      { error: SELF_ACTION_FORBIDDEN_MESSAGE, code: SELF_ACTION_FORBIDDEN_CODE },
      { status: 403 },
    );
  }

  if (currentEmployee.version !== expectedVersion) {
    return buildConflictResponse(currentEmployee);
  }

  // A bulk change (51h) reaches only the people it applies to, by the same
  // rule as the bar and the confirmation's Skipped list.
  const skipReason = bulkAction ? bulkStatusSkipReason(bulkAction, currentEmployee) : null;
  if (skipReason) {
    return respond({ error: skipReason, code: STATUS_NOT_APPLICABLE_CODE }, { status: 400 });
  }

  // Offboarding ends their membership and Restore reopens it (51k), so only
  // a Super Admin or Gridmaster reaches a Super Admin, as when the role is
  // given; that includes planning, moving or cancelling their return (51l).
  const restoringFromOffboard = action === "activate" && currentEmployee.status === "removed";
  const editingReturn = action === "setPlannedChange" && currentEmployee.plannedStatus === "active";
  const restoring =
    restoringFromOffboard ||
    ((action === "setPlannedChange" || action === "cancelPlannedChange") &&
      currentEmployee.plannedStatus === "active");
  const offboarding =
    action === "remove" ||
    (action === "setPlannedChange" && currentEmployee.plannedStatus === "removed");
  if ((offboarding || restoring) && !isGridmaster && !isSuperAdmin && currentEmployee.userId) {
    const { data: targetMembership, error: targetError } = await serviceClient
      .from("organization_memberships")
      .select("org_role")
      .eq("user_id", currentEmployee.userId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!canOffboardAtTier(actor, targetMembership?.org_role)) {
      return respond(
        {
          error: restoring ? RESTORE_OUT_OF_REACH_MESSAGE : OFFBOARD_OUT_OF_REACH_MESSAGE,
          code: OFFBOARD_OUT_OF_REACH_CODE,
        },
        { status: 403 },
      );
    }
  }

  // A start date after today plans an Away (51g1), a suspension (51g3) or a
  // return (51l) rather than starting it, and a last day plans the Offboard
  // for the day after it (51g2).
  let today: string | null = null;
  const orgToday = async () => (today ??= await fetchOrgToday(serviceClient, orgId));
  const editingLastDay =
    action === "setPlannedChange" && currentEmployee.plannedStatus === "removed";
  const editingSuspension =
    action === "setPlannedChange" && currentEmployee.plannedStatus === "suspended";
  const planningLastDay = (action === "remove" && lastDay !== null) || editingLastDay;
  const laterStart = async () => startDate !== null && startDate !== (await orgToday());
  const planningSuspension = (action === "suspend" && (await laterStart())) || editingSuspension;
  const planningReturn = (restoringFromOffboard && (await laterStart())) || editingReturn;
  const editingAway =
    action === "setPlannedChange" && !editingLastDay && !editingSuspension && !editingReturn;
  const planningAway = editingAway || (action === "deactivate" && (await laterStart()));
  const planning = planningAway || planningLastDay || planningSuspension || planningReturn;

  if ((action === "deactivate" || editingAway) && !canMarkInactive(currentEmployee.focusAreaIds)) {
    return respond({ error: NOT_ON_SCHEDULE_MESSAGE, code: NOT_ON_SCHEDULE_CODE }, { status: 400 });
  }

  if (
    action === "suspend" &&
    (currentEmployee.status !== "active" ||
      currentEmployee.archivedAt ||
      currentEmployee.suspendedAt)
  ) {
    return respond({ error: NOT_SUSPENDABLE_MESSAGE, code: NOT_SUSPENDABLE_CODE }, { status: 400 });
  }

  if (action === "suspend" && !currentEmployee.userId) {
    return respond({ error: NO_ACCOUNT_MESSAGE, code: NO_ACCOUNT_CODE }, { status: 400 });
  }

  if ((action === "reinstate" || action === "setSuspendedUntil") && !currentEmployee.suspendedAt) {
    return respond({ error: NOT_SUSPENDED_MESSAGE, code: NOT_SUSPENDED_CODE }, { status: 400 });
  }

  if (
    action === "setReturnDate" &&
    (currentEmployee.status !== "inactive" || currentEmployee.archivedAt)
  ) {
    return respond({ error: NOT_AWAY_MESSAGE, code: NOT_AWAY_CODE }, { status: 400 });
  }

  // A return is the one plan an Offboarded person holds; every other needs someone Active.
  if (
    planningReturn
      ? currentEmployee.status !== "removed"
      : planning &&
        (currentEmployee.status !== "active" ||
          currentEmployee.archivedAt ||
          currentEmployee.suspendedAt)
  ) {
    return respond({ error: NOT_PLANNABLE_MESSAGE, code: NOT_PLANNABLE_CODE }, { status: 400 });
  }

  if (
    (action === "setPlannedChange" || action === "cancelPlannedChange") &&
    !currentEmployee.plannedStatus
  ) {
    return respond(
      { error: NO_PLANNED_CHANGE_MESSAGE, code: NO_PLANNED_CHANGE_CODE },
      { status: 400 },
    );
  }

  if (planningLastDay && (lastDay === null || !isValidLastDay(lastDay, await orgToday()))) {
    return respond(
      { error: LAST_DAY_INVALID_MESSAGE, code: LAST_DAY_INVALID_CODE },
      { status: 400 },
    );
  }

  if (
    (planningAway || planningSuspension || planningReturn) &&
    (startDate === null || !isValidPlannedStart(startDate, await orgToday()))
  ) {
    return respond(
      { error: PLANNED_START_INVALID_MESSAGE, code: PLANNED_START_INVALID_CODE },
      { status: 400 },
    );
  }

  if (planningAway && returnDate !== null && startDate !== null && returnDate <= startDate) {
    return respond(
      { error: PLANNED_RETURN_INVALID_MESSAGE, code: RETURN_DATE_INVALID_CODE },
      { status: 400 },
    );
  }

  if (planningSuspension && returnDate !== null && startDate !== null && returnDate <= startDate) {
    return respond(
      { error: PLANNED_SUSPENSION_END_INVALID_MESSAGE, code: SUSPENDED_UNTIL_INVALID_CODE },
      { status: 400 },
    );
  }

  if (
    returnDate !== null &&
    !planningSuspension &&
    (action === "suspend" || action === "setSuspendedUntil") &&
    !isValidReturnDate(returnDate, await orgToday())
  ) {
    return respond(
      { error: SUSPENDED_UNTIL_INVALID_MESSAGE, code: SUSPENDED_UNTIL_INVALID_CODE },
      { status: 400 },
    );
  }

  if (
    returnDate !== null &&
    (action === "deactivate" || action === "setReturnDate") &&
    !isValidReturnDate(returnDate, await orgToday())
  ) {
    return respond(
      { error: RETURN_DATE_INVALID_MESSAGE, code: RETURN_DATE_INVALID_CODE },
      { status: 400 },
    );
  }

  if (
    absenceTypeId != null &&
    (action === "deactivate" || action === "setReturnDate" || action === "setPlannedChange") &&
    returnDate === null
  ) {
    return respond(
      { error: AWAY_ABSENCE_NEEDS_DATE_MESSAGE, code: AWAY_ABSENCE_INVALID_CODE },
      { status: 400 },
    );
  }

  // Removing staff already fully blocks login at the JWT hook regardless of
  // org_role (see 002_functions_triggers.sql), so removing the org's only
  // super_admin here would lock the org out just as surely as deleting their
  // membership would — the same guard DELETE /api/organizations/access
  // applies before letting a super_admin be removed.
  if ((action === "remove" || action === "suspend") && currentEmployee.userId) {
    const { data: targetMembership } = await serviceClient
      .from("organization_memberships")
      .select("org_role")
      .eq("user_id", currentEmployee.userId)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .maybeSingle();

    if (targetMembership?.org_role === "super_admin") {
      const { count } = await serviceClient
        .from("organization_memberships")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("org_role", "super_admin")
        .is("archived_at", null);

      if (
        (count ?? 0) <= 1 ||
        !(await anotherSuperAdminCanSignIn(serviceClient, orgId, currentEmployee.userId))
      ) {
        return respond({ error: ONLY_SUPER_ADMIN_MESSAGE }, { status: 400 });
      }
    }
  }

  const now = new Date().toISOString();
  // The service client has no auth.uid(), so name the actor: leaving turns
  // their future shifts into pending removals credited to this person.
  const update: Record<string, unknown> = {
    updated_by: actor.id,
    version: expectedVersion + 1,
  };
  if (
    !planning &&
    action !== "setReturnDate" &&
    action !== "setSuspendedUntil" &&
    action !== "cancelPlannedChange"
  ) {
    update.status_changed_at = now;
  }

  let auditAction = "employee.updated";
  let auditDetails: Record<string, unknown> = {
    fromStatus: currentEmployee.status,
  };

  switch (
    planningLastDay
      ? "planLastDay"
      : planningSuspension
        ? "planSuspension"
        : planningReturn
          ? "planReturn"
          : planning
            ? "plan"
            : action
  ) {
    case "planReturn":
      update.planned_status = "active";
      update.planned_from = startDate;
      update.planned_until = null;
      update.planned_absence_type_id = null;
      update.planned_by = actor.id;
      auditAction = editingReturn ? "employee.restore_plan_changed" : "employee.restore_planned";
      auditDetails = {
        ...(editingReturn ? { fromReturnDate: currentEmployee.plannedFrom ?? null } : {}),
        returnDate: startDate,
      };
      break;
    case "planSuspension":
      update.planned_status = "suspended";
      update.planned_from = startDate;
      update.planned_until = returnDate;
      update.planned_absence_type_id = null;
      if (note !== undefined) update.planned_note = note;
      update.planned_by = actor.id;
      auditAction = editingSuspension
        ? "employee.suspension_plan_changed"
        : "employee.suspension_planned";
      auditDetails = {
        ...(editingSuspension
          ? {
              fromPlannedFrom: currentEmployee.plannedFrom ?? null,
              fromPlannedUntil: currentEmployee.plannedUntil ?? null,
            }
          : {}),
        plannedFrom: startDate,
        plannedUntil: returnDate,
      };
      break;
    case "planLastDay":
      update.planned_status = "removed";
      update.planned_from = plannedFromForLastDay(lastDay as string);
      update.planned_until = null;
      update.planned_absence_type_id = null;
      if (action === "remove" || note !== undefined) update.planned_note = note ?? "";
      update.planned_by = actor.id;
      auditAction = editingLastDay ? "employee.last_day_changed" : "employee.last_day_set";
      auditDetails = {
        ...(editingLastDay ? { fromLastDay: plannedLastDay(currentEmployee) } : {}),
        lastDay,
      };
      break;
    case "plan":
      update.planned_status = "away";
      update.planned_from = startDate;
      update.planned_until = returnDate;
      update.planned_absence_type_id = returnDate ? (absenceTypeId ?? null) : null;
      if (action === "deactivate" || note !== undefined) update.planned_note = note ?? "";
      update.planned_by = actor.id;
      auditAction =
        action === "deactivate" ? "employee.away_planned" : "employee.away_plan_changed";
      auditDetails = {
        ...(action === "setPlannedChange"
          ? {
              fromPlannedFrom: currentEmployee.plannedFrom ?? null,
              fromPlannedUntil: currentEmployee.plannedUntil ?? null,
            }
          : {}),
        plannedFrom: startDate,
        plannedUntil: returnDate,
        ...(absenceTypeId ? { plannedAbsenceTypeId: absenceTypeId } : {}),
      };
      break;
    case "cancelPlannedChange":
      update.planned_status = null;
      if (currentEmployee.plannedStatus === "active") {
        auditAction = "employee.restore_plan_cancelled";
        auditDetails = { returnDate: currentEmployee.plannedFrom ?? null };
        break;
      }
      if (currentEmployee.plannedStatus === "suspended") {
        auditAction = "employee.suspension_plan_cancelled";
        auditDetails = {
          plannedFrom: currentEmployee.plannedFrom ?? null,
          plannedUntil: currentEmployee.plannedUntil ?? null,
        };
        break;
      }
      if (currentEmployee.plannedStatus === "removed") {
        auditAction = "employee.last_day_cancelled";
        auditDetails = { lastDay: plannedLastDay(currentEmployee) };
        break;
      }
      auditAction = "employee.away_plan_cancelled";
      auditDetails = {
        plannedFrom: currentEmployee.plannedFrom ?? null,
        plannedUntil: currentEmployee.plannedUntil ?? null,
      };
      break;
    case "deactivate":
      update.status = "inactive";
      update.status_note = note ?? "";
      update.away_until = returnDate;
      update.away_absence_type_id = absenceTypeId ?? null;
      auditAction = "employee.deactivated";
      auditDetails = {
        ...auditDetails,
        toStatus: "inactive",
        note: note ?? "",
        ...(returnDate ? { awayUntil: returnDate } : {}),
        ...(absenceTypeId ? { awayAbsenceTypeId: absenceTypeId } : {}),
      };
      break;
    case "setReturnDate":
      update.away_until = returnDate;
      if (absenceTypeId !== undefined) update.away_absence_type_id = absenceTypeId;
      auditAction = "employee.return_date_changed";
      auditDetails = {
        fromAwayUntil: currentEmployee.awayUntil ?? null,
        toAwayUntil: returnDate,
        ...(absenceTypeId !== undefined &&
        absenceTypeId !== (currentEmployee.awayAbsenceTypeId ?? null)
          ? {
              fromAwayAbsenceTypeId: currentEmployee.awayAbsenceTypeId ?? null,
              toAwayAbsenceTypeId: absenceTypeId,
            }
          : {}),
      };
      break;
    case "activate":
      update.status = "active";
      update.status_note = "";
      update.away_until = null;
      update.archived_at = null;
      auditAction = "employee.activated";
      auditDetails = {
        ...auditDetails,
        toStatus: "active",
      };
      break;
    case "suspend":
      update.suspended_at = now;
      update.suspended_by = actor.id;
      update.suspended_until = returnDate;
      auditAction = "employee.suspended";
      auditDetails = returnDate ? { suspendedUntil: returnDate } : {};
      break;
    case "setSuspendedUntil":
      update.suspended_until = returnDate;
      auditAction = "employee.suspension_end_changed";
      auditDetails = {
        fromSuspendedUntil: currentEmployee.suspendedUntil ?? null,
        toSuspendedUntil: returnDate,
      };
      break;
    case "reinstate":
      update.suspended_at = null;
      update.suspended_by = null;
      auditAction = "employee.reinstated";
      auditDetails = {};
      break;
    case "remove":
      update.status = "removed";
      update.status_note = note ?? "";
      update.archived_at = now;
      auditAction = "employee.removed";
      auditDetails = {
        ...auditDetails,
        toStatus: "removed",
        note: note ?? "",
      };
      break;
  }

  const { data: updatedRow, error: updateError } = await serviceClient
    .from("employees")
    .update(update)
    .eq("id", empId)
    .eq("org_id", orgId)
    .eq("version", expectedVersion)
    .select(EMPLOYEE_COLS)
    .maybeSingle();

  if (updateError) {
    if (isAwayAbsenceRefusal(updateError)) {
      return respond(
        { error: AWAY_ABSENCE_UNKNOWN_MESSAGE, code: AWAY_ABSENCE_INVALID_CODE },
        { status: 400 },
      );
    }
    throw updateError;
  }

  if (!updatedRow) {
    const { data: latestRow, error: latestError } = await serviceClient
      .from("employees")
      .select(EMPLOYEE_COLS)
      .eq("id", empId)
      .eq("org_id", orgId)
      .single();

    if (latestError) throw latestError;
    return buildConflictResponse(rowToEmployee(latestRow as DbEmployee));
  }

  const updatedEmployee = rowToEmployee(updatedRow as DbEmployee);

  // Cut the person's live tokens, not just their next sign-in.
  //
  // The JWT hook refuses to mint for a terminated employee, so they can't
  // sign in or refresh again — but an access token they already hold stays
  // cryptographically valid until it expires, and API routes verify tokens
  // locally now. Org-scoped routes would still reject them on the
  // per-request membership check; this covers the routes that only
  // authenticate. Non-fatal: never fail the status change over it.
  // A suspension signs them out of every device and stops their push here;
  // the hook refuses their next sign-in and refresh (101).
  if (action === "suspend" && !planning && currentEmployee.userId) {
    try {
      await endUserSessions(currentEmployee.userId);
      await disableMobilePushTokensForOrg(serviceClient, {
        userId: currentEmployee.userId,
        orgId,
      });
    } catch (err) {
      logger.error(
        { error: err, orgId, empId, userId: currentEmployee.userId, action },
        "Failed to end sessions or push after suspending",
      );
    }
  }

  if (action === "suspend" && !planning) {
    scheduleSuspensionNotice({ orgId, empId, actorId: actor.id });
  }

  // The membership follows the employee row in the same request, whoever
  // acts (51k): Offboard archives it and ends their sessions, Restore reopens
  // it. The tier guard above keeps Super Admins to Super Admins.
  if (action === "remove" && !planning) {
    await endOffboardedAccess(serviceClient, {
      orgId,
      empId,
      userId: currentEmployee.userId,
      actorId: actor.id,
      at: now,
    });
  }

  if (restoringFromOffboard && !planning) {
    await reopenRestoredAccess(serviceClient, { orgId, empId, userId: currentEmployee.userId });
  }

  const { error: auditError } = await serviceClient.from("audit_log").insert({
    org_id: orgId,
    actor_id: actor.id,
    actor_email: actor.email ?? null,
    action: auditAction,
    resource_type: "employee",
    resource_id: empId,
    details: {
      ...auditDetails,
      changedFields: [
        planning || action === "cancelPlannedChange"
          ? "planned_status"
          : action === "setReturnDate"
            ? "away_until"
            : action === "setSuspendedUntil"
              ? "suspended_until"
              : action === "suspend" || action === "reinstate"
                ? "suspended_at"
                : "status",
      ],
    },
    ip_address: request.ipAddress,
    user_agent: request.userAgent,
  });

  if (auditError) {
    logger.error(
      { error: auditError, orgId, empId, action },
      "Employee status audit log write failed",
    );
  }

  return respond({ success: true, employee: updatedEmployee });
}

/**
 * Gridmaster's Remove from organization (51k): once the membership is
 * archived, their staff record there is offboarded through the same change,
 * so the removal leaves the record an Offboard does and Restore brings both
 * back. Never throws: the removal has already committed.
 */
export async function offboardRemovedMember(
  context: StatusChangeContext,
  userId: string,
): Promise<void> {
  const { serviceClient, orgId } = context;
  try {
    const { data, error } = await serviceClient
      .from("employees")
      .select("id, version")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .neq("status", "removed");
    if (error) throw error;
    for (const row of (data ?? []) as { id: string; version: number }[]) {
      const result = await applyStatusChange(context, {
        empId: row.id,
        action: "remove",
        expectedVersion: row.version,
        returnDate: null,
        startDate: null,
        lastDay: null,
      });
      if (result.status !== 200) {
        logger.warn(
          { orgId, empId: row.id, userId, status: result.status, body: result.body },
          "Staff record not offboarded after removing them from the organization",
        );
      }
    }
  } catch (err) {
    logger.error(
      { error: err, orgId, userId },
      "Failed to offboard the staff record after removing them from the organization",
    );
  }
}
