"use client";

import { parseNameMismatchResponse } from "@/lib/account-linking";
import { formatClientErrorMessage } from "@/lib/client-facing";
import {
  changedElsewhereMessage,
  parseFocusAreaShiftsQuestion,
  SELF_ACTION_FORBIDDEN_CODE,
  SelfActionForbiddenError,
  type BulkStatusAction,
  type FocusAreaShiftsDecision,
  type FocusAreaUpcomingShifts,
} from "@dubgrid/domain";
import type {
  Employee,
  EmployeeActivityEntry,
  EmployeeStatus,
  Invitation,
  ShiftMap,
} from "@/types";

export interface UpdateEmployeeIdentityInput {
  employeeId: string;
  orgId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  /** Optional. Omit to leave the existing email untouched. */
  email?: string;
  /** Optimistic-lock token; pass the version the editor was viewing. */
  expectedVersion: number;
}

export class OptimisticLockError extends Error {
  constructor(
    public readonly shiftId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion?: number,
  ) {
    super(
      `Optimistic lock failed for shift ${shiftId}: expected version ${expectedVersion}${actualVersion !== undefined ? `, but found version ${actualVersion}` : ""}`,
    );
    this.name = "OptimisticLockError";
  }
}

export class EmployeeStatusConflictError extends Error {
  constructor(public readonly latestEmployee: Employee) {
    super(changedElsewhereMessage("their status"));
    this.name = "EmployeeStatusConflictError";
  }
}

export class EmployeeProfileConflictError extends Error {
  constructor(public readonly latestEmployee: Employee) {
    super(changedElsewhereMessage("their details"));
    this.name = "EmployeeProfileConflictError";
  }
}

export class EmployeeContactConflictError extends Error {
  constructor(
    message: string,
    public readonly field: "email" | "phone",
  ) {
    super(message);
    this.name = "EmployeeContactConflictError";
  }
}

/** The server refused the read outright (403) — e.g. a management user's
 * profile requested by a viewer without staff-manager rights. Callers can
 * redirect instead of rendering a dead-end error state. */
export class EmployeeAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeAccessDeniedError";
  }
}

function resolveClientUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return path;
}

async function requestEmployeesJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveClientUrl(input), init);
  const payload = (await response.json().catch(() => null)) as {
    code?: string;
    error?: string;
    employee?: Employee;
    field?: "email" | "phone";
    message?: string;
    status?: string;
  } | null;
  const mismatchError = parseNameMismatchResponse(payload);
  if (mismatchError) {
    throw mismatchError;
  }
  if (
    payload?.code === "EMPLOYEE_CONTACT_CONFLICT" &&
    (payload.field === "email" || payload.field === "phone")
  ) {
    throw new EmployeeContactConflictError(
      payload.message ?? payload.error ?? "Contact details are already in use.",
      payload.field,
    );
  }
  if (response.status === 403) {
    throw new EmployeeAccessDeniedError(
      formatClientErrorMessage(payload?.error, "You don't have permission to do that."),
    );
  }
  if (!response.ok) {
    throw new Error(formatClientErrorMessage(payload?.error, "We couldn't save that. Try again."));
  }

  return payload as T;
}

async function requestEmployeeAction<T>(body: Record<string, unknown>): Promise<T> {
  return requestEmployeesJson<T>("/api/employees/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Saves a new seniority order in one request: all of it, or none of it. */
export function saveSeniorityOrder(
  orgId: string,
  order: Array<{ id: string; seniority: number; version: number }>,
): Promise<Employee[]> {
  return requestEmployeeAction<{ employees: Employee[] }>({
    action: "reorderSeniority",
    orgId,
    order,
  }).then((data) => data.employees);
}

export async function updateEmployeeIdentity(
  input: UpdateEmployeeIdentityInput,
): Promise<{ success: true; employee: Employee }> {
  return requestEmployeesJson<{ success: true; employee: Employee }>("/api/employees/identity", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export interface EmployeeEmailConflictResult {
  conflict: boolean;
  conflictingEmployeeId: string | null;
  /** Why the check flagged it (undefined when conflict is false):
   *  - "employee_duplicate": another active employee's contact email matches.
   *  - "gridmaster": the email belongs to a platform-only Gridmaster account.
   *    Gridmaster is never surfaced to org users, so the UI copy for this
   *    case must stay as generic as `getEmployeeContactConflict`'s "That
   *    email address is reserved." — never name the account type.
   *  - "other_account": it belongs to a different DubGrid account than the
   *    one this employee is (or would be) linked to. */
  reason?: "employee_duplicate" | "gridmaster" | "other_account";
}

/** Pre-flight check: does this email already belong to a different active
 * employee in this org, or to an existing DubGrid account (a case the
 * DB's check_employee_email_belongs_to_user trigger would otherwise only
 * catch on submit)? Lets the UI flag it before save. `currentUserId` is the
 * employee-being-edited's own linked account, if any, so typing their own
 * login email back doesn't trip the "different account" case. */
export async function checkEmployeeEmailConflict(
  email: string,
  orgId: string,
  excludeEmployeeId?: string,
  currentUserId?: string | null,
): Promise<EmployeeEmailConflictResult> {
  return requestEmployeesJson<EmployeeEmailConflictResult>("/api/employees/check-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, orgId, excludeEmployeeId, currentUserId }),
  });
}

export interface EmployeePhoneConflictResult {
  conflict: boolean;
  conflictingEmployeeId: string | null;
}

/** Pre-flight check: does this phone number already belong to a different
 * active employee in this org? Same non-blocking-advisory shape as
 * checkEmployeeEmailConflict. */
export async function checkEmployeePhoneConflict(
  phone: string,
  orgId: string,
  excludeEmployeeId?: string,
): Promise<EmployeePhoneConflictResult> {
  return requestEmployeesJson<EmployeePhoneConflictResult>("/api/employees/check-phone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, orgId, excludeEmployeeId }),
  });
}

export function fetchEmployees(orgId: string, statuses?: EmployeeStatus[]): Promise<Employee[]> {
  return requestEmployeeAction<{ employees: Employee[] }>({
    action: "fetchEmployees",
    orgId,
    statuses,
  }).then((data) => data.employees);
}

export function insertEmployee(employee: Omit<Employee, "id">, orgId: string): Promise<Employee> {
  return requestEmployeeAction<{ employee: Employee }>({
    action: "insertEmployee",
    orgId,
    employee,
  }).then((data) => data.employee);
}

/** The manager closed the question about their shifts, so nothing was saved. */
export class FocusAreaShiftsCancelledError extends Error {
  constructor() {
    super("The save was canceled.");
    this.name = "FocusAreaShiftsCancelledError";
  }
}

export interface UpdateEmployeeOptions {
  /**
   * Asks what to do with their upcoming shifts in the focus areas they come
   * off, when the server needs to know (51i). Resolves null to cancel the
   * save. Without it the server's refusal is thrown as an ordinary error.
   */
  askFocusAreaShifts?: (
    areas: FocusAreaUpcomingShifts[],
  ) => Promise<FocusAreaShiftsDecision | null>;
  /** Told when the save went through but clearing their shifts didn't. */
  onFocusAreaShiftsNotCleared?: (message: string) => void;
}

export async function updateEmployee(
  employee: Employee,
  orgId: string,
  expectedVersion?: number,
  options: UpdateEmployeeOptions = {},
): Promise<Employee> {
  const send = (focusAreaShifts?: FocusAreaShiftsDecision) =>
    fetch(resolveClientUrl("/api/employees/manage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateEmployee",
        orgId,
        employee,
        expectedVersion,
        ...(focusAreaShifts ? { focusAreaShifts } : {}),
      }),
    });
  type Body = {
    code?: string;
    error?: string;
    employee?: Employee;
    field?: "email" | "phone";
    message?: string;
    focusAreaShiftsNotCleared?: string;
  } | null;

  let response = await send();
  let body = (await response.json().catch(() => null)) as Body;

  const areas = response.status === 409 ? parseFocusAreaShiftsQuestion(body) : null;
  if (areas && options.askFocusAreaShifts) {
    const decision = await options.askFocusAreaShifts(areas);
    if (!decision) throw new FocusAreaShiftsCancelledError();
    response = await send(decision);
    body = (await response.json().catch(() => null)) as Body;
  }

  if (
    response.status === 409 &&
    body?.code === "EMPLOYEE_CONTACT_CONFLICT" &&
    (body.field === "email" || body.field === "phone")
  ) {
    throw new EmployeeContactConflictError(
      body.message ?? body.error ?? "Contact details are already in use.",
      body.field,
    );
  }

  if (response.status === 409 && body?.employee) {
    throw new EmployeeProfileConflictError(body.employee);
  }

  if (!response.ok) {
    throw new Error(
      formatClientErrorMessage(body?.error, "We couldn't save those changes. Try again."),
    );
  }

  if (!body?.employee) {
    throw new Error("The server saved the employee but did not return the updated profile.");
  }
  if (body.focusAreaShiftsNotCleared) {
    options.onFocusAreaShiftsNotCleared?.(body.focusAreaShiftsNotCleared);
  }
  return body.employee;
}

export function fetchEmployeeById(employeeId: string, orgId: string): Promise<Employee | null> {
  return requestEmployeeAction<{ employee: Employee | null }>({
    action: "fetchEmployeeById",
    orgId,
    employeeId,
  }).then((data) => data.employee);
}

export function fetchEmployeeByUserId(userId: string, orgId: string): Promise<Employee | null> {
  return requestEmployeeAction<{ employee: Employee | null }>({
    action: "fetchEmployeeByUserId",
    orgId,
    userId,
  }).then((data) => data.employee);
}

export function fetchEmployeeShifts(
  employeeId: string,
  orgId: string,
  assignmentLabelMap: Map<number, string>,
  absenceTypeMap?: Map<number, string>,
  startDate?: string,
  endDate?: string,
): Promise<ShiftMap> {
  return requestEmployeeAction<{ shifts: ShiftMap }>({
    action: "fetchEmployeeShifts",
    orgId,
    employeeId,
    assignmentLabels: [...assignmentLabelMap.entries()],
    absenceTypeLabels: absenceTypeMap ? [...absenceTypeMap.entries()] : undefined,
    startDate,
    endDate,
  }).then((data) => data.shifts);
}

/** Whether they've worked a shift on or before today, so a first day no longer applies. */
export function fetchEmployeeHasStarted(orgId: string, employeeId: string): Promise<boolean> {
  return requestEmployeeAction<{ started: boolean }>({
    action: "fetchEmployeeHasStarted",
    orgId,
    employeeId,
  }).then((data) => data.started);
}

export function fetchEmployeeInvitations(orgId: string, employeeId: string): Promise<Invitation[]> {
  return requestEmployeeAction<{ invitations: Invitation[] }>({
    action: "fetchEmployeeInvitations",
    orgId,
    employeeId,
  }).then((data) => data.invitations);
}

export function fetchEmployeeActivity(
  orgId: string,
  employeeId: string,
): Promise<EmployeeActivityEntry[]> {
  return requestEmployeeAction<{ entries: EmployeeActivityEntry[] }>({
    action: "fetchEmployeeActivity",
    orgId,
    employeeId,
  }).then((data) => data.entries);
}

async function updateEmployeeStatus(
  input: {
    empId: string;
    orgId: string;
    action:
      | "deactivate"
      | "activate"
      | "remove"
      | "setReturnDate"
      | "reinstate"
      | "suspend"
      | "setSuspendedUntil"
      | "setPlannedChange"
      | "cancelPlannedChange";
    expectedVersion: number;
    note?: string;
    returnDate?: string | null;
    absenceTypeId?: number | null;
    startDate?: string | null;
    lastDay?: string | null;
  },
  accessToken?: string,
): Promise<Employee> {
  const response = await fetch(resolveClientUrl("/api/employees/status"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(input),
  });

  const body = (await response.json().catch(() => null)) as {
    error?: string;
    code?: string;
    method?: string;
    employee?: Employee;
  } | null;

  if (response.status === 409 && body?.employee) {
    throw new EmployeeStatusConflictError(body.employee);
  }

  if (body?.code === SELF_ACTION_FORBIDDEN_CODE) {
    throw new SelfActionForbiddenError(body.error);
  }

  if (!response.ok || !body?.employee) {
    // Status, code and method let step-up recognize a request for fresh proof.
    throw Object.assign(
      new Error(
        formatClientErrorMessage(body?.error, "We couldn't update their status. Try again."),
      ),
      { status: response.status, code: body?.code, method: body?.method },
    );
  }

  return body.employee;
}

/** One person's outcome in a bulk status change (51h). */
export interface BulkStatusOutcome {
  empId: string;
  ok: boolean;
  /** The saved row, or the latest one when it changed elsewhere. */
  employee?: Employee;
  /** Why it didn't go through. */
  error?: string;
  code?: string;
}

export interface BulkStatusChangeInput {
  orgId: string;
  action: BulkStatusAction;
  people: { empId: string; expectedVersion: number }[];
  /** Mark away and Offboard: the reason, the same for everyone. */
  note?: string;
  /** Mark away: the first day back, the same for everyone. */
  returnDate?: string | null;
}

/**
 * Runs a bulk status change for the People list: each person's outcome, or
 * null when it didn't run (a cancelled prompt or a refused request, already
 * reported).
 */
export type BulkStatusChangeHandler = (
  action: BulkStatusAction,
  empIds: readonly string[],
  options: { note?: string; returnDate?: string | null },
) => Promise<BulkStatusOutcome[] | null>;

/**
 * One status change for several people (51h), answered per person. Throws
 * only when nobody was changed: a refusal of the whole request (permission,
 * rate limit, a step-up prompt the caller answers, a bad date).
 */
export async function changeEmployeeStatuses(
  { orgId, action, people, note, returnDate }: BulkStatusChangeInput,
  accessToken?: string,
): Promise<BulkStatusOutcome[]> {
  const response = await fetch(resolveClientUrl("/api/employees/status/bulk"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      orgId,
      action,
      people,
      ...(note ? { note } : {}),
      ...(returnDate ? { returnDate } : {}),
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    results?: BulkStatusOutcome[];
    error?: string;
    code?: string;
    method?: string;
  } | null;
  if (!response.ok || !body?.results) {
    // Status, code and method let step-up recognize a request for fresh proof.
    throw Object.assign(
      new Error(
        formatClientErrorMessage(body?.error, "We couldn't change their status. Try again."),
      ),
      { status: response.status, code: body?.code, method: body?.method },
    );
  }
  return body.results;
}

/** Offboards someone now, or with `lastDay` (51g2) the day after it. */
export function removeEmployee(
  empId: string,
  orgId: string,
  expectedVersion: number,
  note?: string,
  accessToken?: string,
  lastDay?: string | null,
): Promise<Employee> {
  return updateEmployeeStatus(
    {
      empId,
      orgId,
      action: "remove",
      expectedVersion,
      note,
      ...(lastDay ? { lastDay } : {}),
    },
    accessToken,
  );
}

export function deactivateEmployee(
  empId: string,
  note: string | undefined,
  orgId: string,
  expectedVersion: number,
  accessToken?: string,
  returnDate?: string | null,
  absenceTypeId?: number | null,
  startDate?: string | null,
): Promise<Employee> {
  return updateEmployeeStatus(
    {
      empId,
      orgId,
      action: "deactivate",
      note,
      expectedVersion,
      ...(returnDate ? { returnDate } : {}),
      ...(returnDate && absenceTypeId ? { absenceTypeId } : {}),
      ...(startDate ? { startDate } : {}),
    },
    accessToken,
  );
}

/** An Away planned for a later date (51g1). */
export interface PlannedAway {
  startDate: string;
  returnDate: string | null;
  absenceTypeId: number | null;
}

/** A last day planned ahead (51g2): offboarded the day after it. */
export interface PlannedLastDay {
  lastDay: string;
}

/**
 * A status change planned for a later date (51g). A planned return (51l) is
 * moved as a `PlannedAway` with its new day as `startDate` and no return date.
 */
export type PlannedChange = PlannedAway | PlannedLastDay;

/** The toast once a planned change is saved or cancelled. */
export function plannedChangeToast(
  plan: PlannedChange | null,
  plannedStatus: Employee["plannedStatus"],
): string {
  if (plan && "lastDay" in plan) return "Last day changed";
  if (plannedStatus === "active")
    return plan ? "Planned return changed" : "Planned return canceled";
  if (plannedStatus === "suspended") {
    return plan ? "Planned suspension changed" : "Planned suspension canceled";
  }
  if (plan) return "Planned time away changed";
  return plannedStatus === "removed" ? "Last day canceled" : "Planned time away canceled";
}

/**
 * Moves or changes someone's planned Away or last day, or cancels it (null).
 * A Gridmaster passes fresh proof as the token to change one.
 */
export function setEmployeePlannedChange(
  empId: string,
  orgId: string,
  expectedVersion: number,
  plan: PlannedChange | null,
  accessToken?: string,
): Promise<Employee> {
  return updateEmployeeStatus(
    plan && "lastDay" in plan
      ? { empId, orgId, action: "setPlannedChange", expectedVersion, lastDay: plan.lastDay }
      : plan
        ? {
            empId,
            orgId,
            action: "setPlannedChange",
            expectedVersion,
            startDate: plan.startDate,
            returnDate: plan.returnDate,
            absenceTypeId: plan.returnDate ? plan.absenceTypeId : null,
          }
        : { empId, orgId, action: "cancelPlannedChange", expectedVersion },
    accessToken,
  );
}

/**
 * Sets, moves or clears (null) an Away person's return date, and the absence
 * their away days hold (null for none).
 */
export function setEmployeeReturnDate(
  empId: string,
  orgId: string,
  expectedVersion: number,
  returnDate: string | null,
  absenceTypeId: number | null = null,
): Promise<Employee> {
  return updateEmployeeStatus({
    empId,
    orgId,
    action: "setReturnDate",
    expectedVersion,
    returnDate,
    absenceTypeId: returnDate ? absenceTypeId : null,
  });
}

/**
 * A suspension's dates (51g3): a first day after today plans it for then, and
 * `until` is the first day they have access again.
 */
export interface SuspensionDates {
  startDate?: string | null;
  until?: string | null;
}

/** Suspends someone's access (51c); a Gridmaster passes fresh proof as the token. */
export function suspendEmployee(
  empId: string,
  orgId: string,
  expectedVersion: number,
  accessToken?: string,
  { startDate = null, until = null }: SuspensionDates = {},
): Promise<Employee> {
  return updateEmployeeStatus(
    {
      empId,
      orgId,
      action: "suspend",
      expectedVersion,
      ...(startDate ? { startDate } : {}),
      ...(until ? { returnDate: until } : {}),
    },
    accessToken,
  );
}

/** Sets, moves or clears (null) a suspended person's end date (51g3). */
export function setEmployeeSuspendedUntil(
  empId: string,
  orgId: string,
  expectedVersion: number,
  until: string | null,
): Promise<Employee> {
  return updateEmployeeStatus({
    empId,
    orgId,
    action: "setSuspendedUntil",
    expectedVersion,
    returnDate: until,
  });
}

/** Gives a suspended person (51c) their access back. */
export function reinstateEmployee(
  empId: string,
  orgId: string,
  expectedVersion: number,
): Promise<Employee> {
  return updateEmployeeStatus({ empId, orgId, action: "reinstate", expectedVersion });
}

/** Marks someone active or restores them now; for someone Offboarded, `startDate` restores them then (51l). */
export function activateEmployee(
  empId: string,
  orgId: string,
  expectedVersion: number,
  startDate?: string | null,
): Promise<Employee> {
  return updateEmployeeStatus({
    empId,
    orgId,
    action: "activate",
    expectedVersion,
    ...(startDate ? { startDate } : {}),
  });
}
