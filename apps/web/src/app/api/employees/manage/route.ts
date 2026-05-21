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
import {
  requireOrgPermissions,
  resolveEffectiveOrgId,
} from "@/app/api/shared/permissions";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { fetchAssignmentIdByPairMap } from "@/app/api/shared/schedule";
import { mapNormalizedScheduleCellRowToScheduleEntry } from "@/lib/schedule-cells";
import {
  employeeToRow,
  rowToEmployee,
  rowToInvitation,
} from "@/lib/db/mappers";
import { EMPLOYEE_COLS } from "@/lib/db/shared";
import { getEmployeeContactConflict } from "@/lib/employee-contact-conflicts";
import { apiErrorResponse } from "@/lib/error-handling";
import {
  buildStaffValidationErrorResponse,
  employeeEmploymentTypeSchema,
  getStaffFieldErrorsFromZod,
  normalizeStaffTextFields,
  validateStaffOrgReferences,
} from "@/lib/staff-validation";
import {
  optionalUsPhoneSchema,
  requiredStaffEmailSchema,
  staffNameSchema,
  staffNotesSchema,
} from "@dubgrid/contracts";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";

export const dynamic = "force-dynamic";

type OrgPermissionPredicate = Parameters<typeof requireOrgPermissions>[2];

function requireEmployeeSetupPermissions(
  req: NextRequest,
  orgId: string,
  isAllowed: OrgPermissionPredicate,
) {
  return requireOrgPermissions(req, orgId, isAllowed, {
    allowDuringSetup: true,
  });
}

const employeeStatusSchema = z.enum(["active", "benched", "terminated"]);
const mapEntrySchema = z.array(z.tuple([z.number().int(), z.string()]));

const employeeSchema = z.object({
  id: z.string().uuid(),
  firstName: staffNameSchema,
  lastName: staffNameSchema,
  employmentType: employeeEmploymentTypeSchema,
  status: employeeStatusSchema,
  statusChangedAt: z.string().datetime({ offset: true }).nullable(),
  statusNote: z.string(),
  certificationId: z.number().int().nullable(),
  roleIds: z.array(z.number().int()),
  seniority: z.number().int(),
  focusAreaIds: z.array(z.number().int()),
  phone: optionalUsPhoneSchema,
  email: requiredStaffEmailSchema,
  contactNotes: staffNotesSchema,
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

// View-only callers (canViewStaff but neither canViewEmployeeDetails nor
// canManageEmployees, and not super_admin/gridmaster) get the same masked
// payload the mobile person endpoint returns to non-managers.
function isEmployeeDetailViewer(permissions: {
  isGridmaster: boolean;
  isSuperAdmin: boolean;
  canViewEmployeeDetails: boolean;
  canManageEmployees: boolean;
}): boolean {
  return (
    permissions.isGridmaster ||
    permissions.isSuperAdmin ||
    permissions.canViewEmployeeDetails ||
    permissions.canManageEmployees
  );
}

function maskEmployeeForViewer(employee: Employee): Employee {
  return {
    ...employee,
    contactNotes: "",
    statusNote: "",
    deptAdminIds: [],
    userId: null,
  };
}

function assertDateRange(startDate?: string, endDate?: string): void {
  if (!startDate || !endDate) {
    return;
  }

  const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
  if (diffMs > MAX_RANGE_DAYS * 86_400_000) {
    throw new Error(`Shift query range exceeds ${MAX_RANGE_DAYS} days`);
  }
}

function diffEmployeeProfileFields(
  before: Employee,
  after: Employee,
): string[] {
  const fields: string[] = [];
  if (before.firstName !== after.firstName) fields.push("firstName");
  if (before.lastName !== after.lastName) fields.push("lastName");
  if (before.email !== after.email) fields.push("email");
  if (before.phone !== after.phone) fields.push("phone");
  if (before.contactNotes !== after.contactNotes) fields.push("contactNotes");
  if (before.employmentType !== after.employmentType) fields.push("employmentType");
  if (before.certificationId !== after.certificationId) fields.push("certification");
  if (before.seniority !== after.seniority) fields.push("seniority");
  if (
    JSON.stringify([...before.roleIds].sort()) !==
    JSON.stringify([...after.roleIds].sort())
  )
    fields.push("roles");
  if (
    JSON.stringify([...before.focusAreaIds].sort()) !==
    JSON.stringify([...after.focusAreaIds].sort())
  )
    fields.push("focusAreas");
  if (
    JSON.stringify([...before.departmentIds].sort()) !==
    JSON.stringify([...after.departmentIds].sort())
  )
    fields.push("departments");
  if (
    JSON.stringify([...before.deptAdminIds].sort()) !==
    JSON.stringify([...after.deptAdminIds].sort())
  )
    fields.push("departmentAdmin");
  return fields;
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
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return buildStaffValidationErrorResponse(
      getStaffFieldErrorsFromZod(parsed.error),
    );
  }

  const data = parsed.data;

  // Redirect body.orgId to the sandbox if the caller is in sandbox
  // mode. Without this, the per-case auth checks below validate against
  // the sandbox while the downstream queries (`.eq("org_id", data.orgId)`,
  // `employeeToRow(..., data.orgId)`, etc.) target the real organization —
  // the same data-leak class fixed in /api/settings/config.
  {
    const auth = await requireAuthenticatedUser(req);
    if (!("response" in auth)) {
      const effective = await resolveEffectiveOrgId(
        req,
        auth.user.id,
        data.orgId,
      );
      if (effective !== data.orgId) {
        (data as { orgId: string }).orgId = effective;
      }
    }
  }

  try {
    switch (data.action) {
      case "fetchEmployees": {
        const auth = await requireEmployeeSetupPermissions(
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

        const isManager = isEmployeeDetailViewer(auth.permissions);

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
        // View-only callers see active staff only, matching the mobile
        // /people endpoint.
        if (!isManager) {
          query = query.eq("status", "active");
        }

        const { data: rows, error } = await query.order("seniority");
        if (error) {
          throw error;
        }

        const mapped = ((rows ?? []) as DbEmployee[]).map(rowToEmployee);
        return NextResponse.json({
          employees: isManager ? mapped : mapped.map(maskEmployeeForViewer),
        });
      }

      case "insertEmployee": {
        const auth = await requireEmployeeSetupPermissions(
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

        const referenceErrors = await validateStaffOrgReferences(
          auth.serviceClient,
          data.orgId,
          {
            certificationId: data.employee.certificationId,
            departmentIds: data.employee.departmentIds,
            deptAdminIds: data.employee.deptAdminIds,
            focusAreaIds: data.employee.focusAreaIds,
            requireFocusArea: true,
            roleIds: data.employee.roleIds,
          },
        );
        if (Object.keys(referenceErrors).length > 0) {
          return buildStaffValidationErrorResponse(referenceErrors);
        }

        const { data: row, error } = await auth.serviceClient
          .from("employees")
          .insert(employeeToRow(data.employee, data.orgId))
          .select(EMPLOYEE_COLS)
          .single();
        if (error) {
          throw error;
        }

        const insertedRow = row as DbEmployee;
        void dispatchNotificationEvent(auth.actor.id, {
          action: "employee_created",
          orgId: data.orgId,
          empId: insertedRow.id,
        });

        return NextResponse.json({
          employee: rowToEmployee(insertedRow),
        });
      }

      case "updateEmployee": {
        const auth = await requireEmployeeSetupPermissions(
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

        const referenceErrors = await validateStaffOrgReferences(
          auth.serviceClient,
          data.orgId,
          {
            certificationId: data.employee.certificationId,
            departmentIds: data.employee.departmentIds,
            deptAdminIds: data.employee.deptAdminIds,
            focusAreaIds: data.employee.focusAreaIds,
            requireFocusArea: true,
            roleIds: data.employee.roleIds,
          },
        );
        if (Object.keys(referenceErrors).length > 0) {
          return buildStaffValidationErrorResponse(referenceErrors);
        }

        const normalizedFields = normalizeStaffTextFields({
          firstName: data.employee.firstName,
          lastName: data.employee.lastName,
          email: data.employee.email,
          phone: data.employee.phone,
          contactNotes: data.employee.contactNotes,
        });

        const nextEmployee = {
          ...data.employee,
          firstName: normalizedFields.firstName ?? data.employee.firstName,
          lastName: normalizedFields.lastName ?? data.employee.lastName,
          phone: normalizedFields.phone ?? data.employee.phone,
          email: normalizedFields.email ?? data.employee.email,
          contactNotes:
            normalizedFields.contactNotes ?? data.employee.contactNotes,
        };

        // Snapshot the prior row so we can diff status vs profile fields
        // for notification dispatch after a successful update.
        const previousRow = await fetchLatestEmployee(
          auth.serviceClient,
          data.orgId,
          nextEmployee.id,
        );

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
              error:
                "Employee details changed elsewhere. Refresh and try again.",
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

        if (previousRow) {
          if (previousRow.status !== nextEmployee.status) {
            void dispatchNotificationEvent(auth.actor.id, {
              action: "employee_status_changed",
              orgId: data.orgId,
              empId: nextEmployee.id,
              fromStatus: previousRow.status,
              toStatus: nextEmployee.status,
            });
          }
          const changedProfileFields = diffEmployeeProfileFields(
            previousRow,
            nextEmployee,
          );
          if (changedProfileFields.length > 0) {
            void dispatchNotificationEvent(auth.actor.id, {
              action: "employee_profile_changed",
              orgId: data.orgId,
              empId: nextEmployee.id,
              fields: changedProfileFields,
            });
          }
        }

        return NextResponse.json({
          employee: rowToEmployee(updatedRow as DbEmployee),
        });
      }

      case "fetchEmployeeById": {
        const auth = await requireEmployeeSetupPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canViewEmployeeDetails ||
            permissions.canManageEmployees ||
            permissions.canViewStaff,
        );
        if ("response" in auth) {
          return auth.response;
        }

        const employee = await fetchLatestEmployee(
          auth.serviceClient,
          data.orgId,
          data.employeeId,
        );

        if (!isEmployeeDetailViewer(auth.permissions)) {
          // Mirror the mobile person endpoint: view-only callers only see
          // active staff, with sensitive fields stripped.
          if (!employee || employee.status !== "active") {
            return NextResponse.json({ employee: null });
          }
          return NextResponse.json({
            employee: maskEmployeeForViewer(employee),
          });
        }

        return NextResponse.json({ employee });
      }

      case "fetchEmployeeByUserId": {
        const auth = await requireEmployeeSetupPermissions(req, data.orgId, () => true);
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
        const auth = await requireEmployeeSetupPermissions(
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
        const assignmentLabelMap = new Map<number, string>(
          data.assignmentLabels,
        );
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
            "id, emp_id, date, org_id, version, series_id, from_recurring, created_by, updated_by, created_at, updated_at, snapshots:schedule_cell_snapshots(id, cell_id, org_id, snapshot_kind, state_kind, absence_type_id, custom_start_time, custom_end_time, created_at, updated_at, segments:schedule_cell_segments(id, snapshot_id, org_id, position, shift_id, job_id, is_mentored, created_at, updated_at))",
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
        const auth = await requireEmployeeSetupPermissions(
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
        const auth = await requireEmployeeSetupPermissions(
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
    const contactConflict = getEmployeeContactConflict(error);
    if (contactConflict) {
      return NextResponse.json(contactConflict, { status: 409 });
    }

    return apiErrorResponse(error, "Employee request failed");
  }
}
