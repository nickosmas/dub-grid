import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DbEmployee,
  DbInvitation,
  DbScheduleCell,
} from "@dubgrid/db-types";
import { scheduleCellStateSchema } from "@dubgrid/contracts";
import type { Employee } from "@/types";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { fetchAssignmentIdByPairMap } from "@/app/api/shared/schedule";
import { mapNormalizedScheduleCellRowToScheduleEntry } from "@/lib/schedule-cells";
import {
  employeeToRow,
  rowToEmployee,
  rowToInvitation,
} from "@/lib/db/mappers";
import { EMPLOYEE_COLS } from "@/lib/db/shared";

export const dynamic = "force-dynamic";

const employeeStatusSchema = z.enum(["active", "benched", "terminated"]);
const mapEntrySchema = z.array(z.tuple([z.number().int(), z.string()]));

const employeeSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  status: employeeStatusSchema,
  statusChangedAt: z.string().datetime({ offset: true }).nullable(),
  statusNote: z.string(),
  certificationId: z.number().int().nullable(),
  roleIds: z.array(z.number().int()),
  seniority: z.number().int(),
  focusAreaIds: z.array(z.number().int()),
  phone: z.string(),
  email: z.string(),
  contactNotes: z.string(),
  archivedAt: z.string().datetime({ offset: true }).nullable().optional(),
  userId: z.string().uuid().nullable(),
  departmentIds: z.array(z.number().int()),
  deptAdminIds: z.array(z.number().int()),
  version: z.number().int().nonnegative(),
});

const employeeCreateSchema = employeeSchema.omit({ id: true });

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("fetchEmployees"),
    orgId: z.string().uuid(),
    statuses: z.array(employeeStatusSchema).optional(),
  }),
  z.object({
    action: z.literal("insertEmployee"),
    orgId: z.string().uuid(),
    employee: employeeCreateSchema,
  }),
  z.object({
    action: z.literal("updateEmployee"),
    orgId: z.string().uuid(),
    employee: employeeSchema,
    expectedVersion: z.number().int().nonnegative().optional(),
  }),
  z.object({
    action: z.literal("fetchEmployeeById"),
    orgId: z.string().uuid(),
    employeeId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("fetchEmployeeByUserId"),
    orgId: z.string().uuid(),
    userId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("fetchEmployeeShifts"),
    orgId: z.string().uuid(),
    employeeId: z.string().uuid(),
    assignmentLabels: mapEntrySchema,
    absenceTypeLabels: mapEntrySchema.optional(),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
  }),
  z.object({
    action: z.literal("fetchEmployeeInvitations"),
    orgId: z.string().uuid(),
    employeeId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("fetchEmployeeRoleHistory"),
    orgId: z.string().uuid(),
    userId: z.string().uuid(),
  }),
]);

const MAX_RANGE_DAYS = 366;

function assertDateRange(startDate?: string, endDate?: string): void {
  if (!startDate || !endDate) {
    return;
  }

  const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
  if (diffMs > MAX_RANGE_DAYS * 86_400_000) {
    throw new Error(`Shift query range exceeds ${MAX_RANGE_DAYS} days`);
  }
}

async function fetchLatestEmployee(
  serviceClient: SupabaseClient,
  orgId: string,
  employeeId: string,
): Promise<Employee | null> {
  const { data, error } = await serviceClient
    .from("employees")
    .select(EMPLOYEE_COLS)
    .eq("org_id", orgId)
    .eq("id", employeeId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? rowToEmployee(data as DbEmployee) : null;
}

async function syncLinkedProfileName(
  serviceClient: SupabaseClient,
  userId: string | null,
  firstName: string,
  lastName: string,
): Promise<void> {
  if (!userId) {
    return;
  }

  const { error } = await serviceClient
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    throw error;
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const data = parsed.data;

  try {
    switch (data.action) {
      case "fetchEmployees": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canViewStaff ||
            permissions.canManageEmployees,
        );
        if ("response" in auth) {
          return auth.response;
        }

        let query = auth.serviceClient
          .from("employees")
          .select(EMPLOYEE_COLS)
          .eq("org_id", data.orgId);
        const includesTerminated = data.statuses?.includes("terminated");
        if (!includesTerminated) {
          query = query.is("archived_at", null);
        }
        if (data.statuses && data.statuses.length > 0) {
          query = query.in("status", data.statuses);
        }

        const { data: rows, error } = await query.order("seniority");
        if (error) {
          throw error;
        }

        return NextResponse.json({
          employees: ((rows ?? []) as DbEmployee[]).map(rowToEmployee),
        });
      }

      case "insertEmployee": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canManageEmployees,
        );
        if ("response" in auth) {
          return auth.response;
        }

        const { data: row, error } = await auth.serviceClient
          .from("employees")
          .insert(employeeToRow(data.employee, data.orgId))
          .select(EMPLOYEE_COLS)
          .single();
        if (error) {
          throw error;
        }

        return NextResponse.json({
          employee: rowToEmployee(row as DbEmployee),
        });
      }

      case "updateEmployee": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canManageEmployees,
        );
        if ("response" in auth) {
          return auth.response;
        }

        const nextEmployee = {
          ...data.employee,
          firstName: data.employee.firstName.trim(),
          lastName: data.employee.lastName.trim(),
          phone: data.employee.phone.trim(),
          email: data.employee.email.trim(),
          contactNotes: data.employee.contactNotes.trim(),
        };

        let query = auth.serviceClient
          .from("employees")
          .update(employeeToRow(nextEmployee, data.orgId))
          .eq("org_id", data.orgId)
          .eq("id", nextEmployee.id);
        if (data.expectedVersion !== undefined) {
          query = query.eq("version", data.expectedVersion);
        }

        const { data: updatedRow, error } = await query
          .select(EMPLOYEE_COLS)
          .maybeSingle();
        if (error) {
          throw error;
        }

        if (!updatedRow) {
          const latestEmployee = await fetchLatestEmployee(
            auth.serviceClient,
            data.orgId,
            nextEmployee.id,
          );
          return NextResponse.json(
            {
              error: "Employee details changed elsewhere. Refresh and try again.",
              code: "EMPLOYEE_CONFLICT",
              employee: latestEmployee,
            },
            { status: 409 },
          );
        }

        await syncLinkedProfileName(
          auth.serviceClient,
          nextEmployee.userId,
          nextEmployee.firstName,
          nextEmployee.lastName,
        );

        return NextResponse.json({
          employee: rowToEmployee(updatedRow as DbEmployee),
        });
      }

      case "fetchEmployeeById": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canViewEmployeeDetails ||
            permissions.canManageEmployees,
        );
        if ("response" in auth) {
          return auth.response;
        }

        const employee = await fetchLatestEmployee(
          auth.serviceClient,
          data.orgId,
          data.employeeId,
        );
        return NextResponse.json({ employee });
      }

      case "fetchEmployeeByUserId": {
        const auth = await requireOrgPermissions(req, data.orgId, () => true);
        if ("response" in auth) {
          return auth.response;
        }

        const canReadOtherEmployees =
          auth.permissions.isGridmaster ||
          auth.permissions.isSuperAdmin ||
          auth.permissions.canViewEmployeeDetails ||
          auth.permissions.canManageEmployees;
        if (!canReadOtherEmployees && auth.actor.id !== data.userId) {
          return NextResponse.json(
            { error: "Insufficient permissions" },
            { status: 403 },
          );
        }

        const { data: row, error } = await auth.serviceClient
          .from("employees")
          .select(EMPLOYEE_COLS)
          .eq("org_id", data.orgId)
          .eq("user_id", data.userId)
          .maybeSingle();
        if (error) {
          throw error;
        }

        return NextResponse.json({
          employee: row ? rowToEmployee(row as DbEmployee) : null,
        });
      }

      case "fetchEmployeeShifts": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canViewEmployeeDetails ||
            permissions.canManageEmployees,
        );
        if ("response" in auth) {
          return auth.response;
        }

        assertDateRange(data.startDate, data.endDate);
        const assignmentLabelMap = new Map<number, string>(data.assignmentLabels);
        const absenceTypeMap = new Map<number, string>(
          data.absenceTypeLabels ?? [],
        );
        const assignmentIdByPair = await fetchAssignmentIdByPairMap(
          auth.serviceClient,
          data.orgId,
        );

        let query = auth.serviceClient
          .from("schedule_cells")
          .select(
            "id, emp_id, date, org_id, version, series_id, from_recurring, created_by, updated_by, created_at, updated_at, snapshots:schedule_cell_snapshots(id, cell_id, org_id, snapshot_kind, state_kind, absence_type_id, custom_start_time, custom_end_time, created_at, updated_at, segments:schedule_cell_segments(id, snapshot_id, org_id, position, shift_id, job_id, created_at, updated_at))",
          )
          .eq("org_id", data.orgId)
          .eq("emp_id", data.employeeId)
          .order("date", { ascending: false });
        if (data.startDate) {
          query = query.gte("date", data.startDate);
        }
        if (data.endDate) {
          query = query.lte("date", data.endDate);
        }

        const { data: rows, error } = await query;
        if (error) {
          throw error;
        }

        const shifts: Record<string, unknown> = {};
        for (const row of (rows ?? []) as DbScheduleCell[]) {
          const entry = mapNormalizedScheduleCellRowToScheduleEntry(row, {
            isScheduler: true,
            assignmentLabelMap,
            assignmentIdByPair,
            absenceTypeMap,
          });
          if (entry) {
            shifts[`${row.emp_id}_${row.date}`] = entry;
          }
        }

        return NextResponse.json({ shifts });
      }

      case "fetchEmployeeInvitations": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canViewEmployeeDetails ||
            permissions.canManageEmployees,
        );
        if ("response" in auth) {
          return auth.response;
        }

        const { data: rows, error } = await auth.serviceClient
          .from("invitations")
          .select(
            "id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids",
          )
          .eq("org_id", data.orgId)
          .eq("employee_id", data.employeeId)
          .order("created_at", { ascending: false });
        if (error) {
          throw error;
        }

        return NextResponse.json({
          invitations: ((rows ?? []) as DbInvitation[]).map(rowToInvitation),
        });
      }

      case "fetchEmployeeRoleHistory": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) => permissions.isGridmaster,
        );
        if ("response" in auth) {
          return auth.response;
        }

        const { data: rows, error } = await auth.serviceClient.rpc(
          "get_audit_log",
          {
            p_org_id: null,
            p_limit: 50,
            p_offset: 0,
            p_target_user_id: data.userId,
          },
        );
        if (error) {
          throw error;
        }

        return NextResponse.json({
          entries: (rows ?? []).map((row: Record<string, unknown>) => ({
            id: row.id as string,
            targetUserId: row.target_user_id as string,
            targetEmail: (row.target_email as string | null) ?? null,
            changedById: row.changed_by_id as string,
            changedByEmail: (row.changed_by_email as string | null) ?? null,
            fromRole: row.from_role as string,
            toRole: row.to_role as string,
            createdAt: row.created_at as string,
            orgId: (row.org_id as string | null) ?? null,
            orgName: (row.org_name as string | null) ?? null,
          })),
        });
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Employee request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
