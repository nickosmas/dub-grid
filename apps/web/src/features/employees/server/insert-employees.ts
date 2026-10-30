import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbEmployee } from "@dubgrid/db-types";
import {
  FIRST_DAY_INVALID_CODE,
  FIRST_DAY_INVALID_MESSAGE,
  isValidFirstDay,
} from "@dubgrid/domain";
import type { Employee } from "@/types";
import { employeeToRow, rowToEmployee } from "@/lib/db/mappers";
import { EMPLOYEE_COLS } from "@/lib/db/shared";
import { getEmployeeContactConflict } from "@/lib/employee-contact-conflicts";
import {
  buildStaffValidationErrorResponse,
  validateStaffOrgReferences,
} from "@/lib/staff-validation";
import { dispatchNotificationEvent } from "@/features/notifications/server";
import logger from "@/lib/logger";
import { fetchOrgToday } from "./org-today";

export { MAX_EMPLOYEE_BATCH } from "../insert-limit";

/** A new person as the form sends them; seniority is assigned here, after everyone else. */
export type NewEmployeeInput = Omit<Parameters<typeof employeeToRow>[0], "seniority"> & {
  seniority?: number;
};

export interface InsertEmployeesResult {
  /** Everyone added, in the order sent. */
  employees: Employee[];
  /** Rows that weren't added, by their position in the request. */
  failed: Array<{ index: number; error: string }>;
}

export type InsertEmployeesOutcome = InsertEmployeesResult | { response: Response };

const INSERT_FALLBACK_MESSAGE = "We couldn't add that person. Try again.";

/**
 * Adds several people in one request with the single insert's checks: every
 * row's references and first day are checked before anything is written, and
 * each person added gets their own audit row and created event. A row the
 * database refuses (a contact already in use) is reported and the rest added.
 */
export async function insertEmployees(args: {
  serviceClient: SupabaseClient;
  orgId: string;
  actor: { id: string; email?: string | null };
  employees: NewEmployeeInput[];
  ip: string | null;
  userAgent: string | null;
}): Promise<InsertEmployeesOutcome> {
  const { serviceClient, orgId, actor, employees } = args;

  const referenceErrors = await Promise.all(
    employees.map((employee) =>
      validateStaffOrgReferences(serviceClient, orgId, {
        certificationId: employee.certificationId,
        departmentIds: employee.departmentIds,
        deptAdminIds: employee.deptAdminIds,
        focusAreaIds: employee.focusAreaIds,
        requireFocusArea: true,
        roleIds: employee.roleIds,
      }),
    ),
  );
  const firstRefused = referenceErrors.find((errors) => Object.keys(errors).length > 0);
  if (firstRefused) {
    return { response: buildStaffValidationErrorResponse(firstRefused) };
  }

  if (employees.some((employee) => employee.firstDay)) {
    const today = await fetchOrgToday(serviceClient, orgId);
    if (
      employees.some((employee) => employee.firstDay && !isValidFirstDay(employee.firstDay, today))
    ) {
      return {
        response: Response.json(
          { error: FIRST_DAY_INVALID_MESSAGE, code: FIRST_DAY_INVALID_CODE },
          { status: 400 },
        ),
      };
    }
  }

  const { data: lastRow, error: seniorityError } = await serviceClient
    .from("employees")
    .select("seniority")
    .eq("org_id", orgId)
    .order("seniority", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (seniorityError) throw seniorityError;
  const baseSeniority = (lastRow as { seniority: number } | null)?.seniority ?? 0;

  const rows = employees.map((employee, index) =>
    employeeToRow({ ...employee, seniority: baseSeniority + index + 1 }, orgId),
  );
  const { inserted, failed } = await insertRows(serviceClient, rows);

  const added = inserted.map(({ index, row }) => ({ index, employee: rowToEmployee(row) }));
  for (const { employee } of added) {
    void dispatchNotificationEvent(actor.id, {
      action: "employee_created",
      orgId,
      empId: employee.id,
    });
  }
  if (added.length > 0) {
    const { error: auditError } = await serviceClient.from("audit_log").insert(
      added.map(({ index, employee }) => ({
        org_id: orgId,
        actor_id: actor.id,
        actor_email: actor.email ?? null,
        action: "employee.created",
        resource_type: "employee",
        resource_id: employee.id,
        details: {
          firstName: employees[index].firstName,
          lastName: employees[index].lastName,
          ...(employees[index].firstDay ? { firstDay: employees[index].firstDay } : {}),
        },
        ip_address: args.ip,
        user_agent: args.userAgent,
      })),
    );
    if (auditError) {
      logger.error({ error: auditError, orgId }, "Employee create audit log write failed");
    }
  }

  if (added.length === 0 && failed.length > 0) {
    const conflict = getEmployeeContactConflict(failed[0].cause);
    return {
      response: conflict
        ? Response.json(conflict, { status: 409 })
        : Response.json({ error: INSERT_FALLBACK_MESSAGE }, { status: 500 }),
    };
  }

  return {
    employees: added.map(({ employee }) => employee),
    failed: failed.map(({ index, cause }) => ({
      index,
      error: getEmployeeContactConflict(cause)?.message ?? INSERT_FALLBACK_MESSAGE,
    })),
  };
}

type EmployeeRow = ReturnType<typeof employeeToRow>;

/**
 * One insert for the whole list. If the database refuses it, each row is
 * tried alone so one conflicting row doesn't keep the others out.
 */
async function insertRows(
  serviceClient: SupabaseClient,
  rows: EmployeeRow[],
): Promise<{
  inserted: Array<{ index: number; row: DbEmployee }>;
  failed: Array<{ index: number; cause: unknown }>;
}> {
  const { data, error } = await serviceClient.from("employees").insert(rows).select(EMPLOYEE_COLS);
  if (!error) {
    // Seniority is unique within the request, so it ties each row back to its position.
    const indexBySeniority = new Map(rows.map((row, index) => [row.seniority, index]));
    const inserted = ((data ?? []) as DbEmployee[])
      .map((row) => ({ index: indexBySeniority.get(row.seniority) ?? -1, row }))
      .filter(({ index }) => index >= 0)
      .sort((a, b) => a.index - b.index);
    return { inserted, failed: [] };
  }

  const inserted: Array<{ index: number; row: DbEmployee }> = [];
  const failed: Array<{ index: number; cause: unknown }> = [];
  for (const [index, row] of rows.entries()) {
    const { data: single, error: rowError } = await serviceClient
      .from("employees")
      .insert(row)
      .select(EMPLOYEE_COLS)
      .single();
    if (rowError) {
      logger.error({ error: rowError, index }, "Employee insert failed");
      failed.push({ index, cause: rowError });
    } else {
      inserted.push({ index, row: single as DbEmployee });
    }
  }
  return { inserted, failed };
}
