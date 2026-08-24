import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import type { AdminPermissions, DirectoryPerson, EmployeeStatus, OrganizationRole } from "@/types";
import { API_ERRORS } from "@dubgrid/client-errors";
import logger from "@/lib/logger";

const searchSchema = z.object({
  orgId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const DEFAULT_PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  try {
    const parsed = searchSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const orgAuth = await requireOrgPermissions(
      req,
      parsed.data.orgId,
      (permissions) =>
        permissions.isGridmaster ||
        permissions.isSuperAdmin ||
        permissions.canViewStaff ||
        permissions.canManageEmployees,
    );
    if ("response" in orgAuth) {
      return orgAuth.response;
    }

    const serviceClient = orgAuth.serviceClient;
    // Only super_admins/gridmasters may edit (and therefore see) the per-user
    // permission matrix; redact it for everyone else even though the directory
    // itself is visible to canViewStaff.
    const canSeePermissions = orgAuth.permissions.isSuperAdmin || orgAuth.permissions.isGridmaster;
    // Sign-in activity is admin telemetry: staff managers see it, view-only
    // directory callers don't.
    const canSeeActivity = canSeePermissions || orgAuth.permissions.canManageEmployees;
    const limit = parsed.data.limit ?? DEFAULT_PAGE_SIZE;
    const offset = parsed.data.offset ?? 0;
    const { data, error } = await serviceClient.rpc("get_org_directory", {
      // Use the auth-effective orgId — when the caller is in sandbox
      // mode, this is the sandbox id, not the body's real-org id.
      p_org_id: orgAuth.orgId,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    // A full page suggests more rows may exist; the client re-checks by
    // fetching the next page and stopping once it comes back short.
    const hasMore = rows.length === limit;

    const directory = rows.map((row: Record<string, unknown>) => {
      const scheduledDepartmentIds =
        (row.scheduled_department_ids as number[] | undefined) ??
        (row.employee_department_ids as number[] | undefined) ??
        [];
      const scheduledDeptAdminIds =
        (row.scheduled_dept_admin_ids as number[] | undefined) ??
        (row.employee_dept_admin_ids as number[] | undefined) ??
        [];
      const managementDepartmentIds =
        (row.management_department_ids as number[] | undefined) ??
        (row.department_ids as number[] | undefined) ??
        [];
      const managementDeptAdminIds =
        (row.management_dept_admin_ids as number[] | undefined) ??
        (row.dept_admin_ids as number[] | undefined) ??
        [];
      const hasAppAccess = (row.has_app_access as boolean) ?? false;

      return {
        personId: row.person_id as string,
        source: row.source as "employee" | "user_only" | "pending_invite",
        employeeId: (row.employee_id as string | null) ?? null,
        employeeNumber: (row.employee_number as number | null) ?? null,
        userId: (row.user_id as string | null) ?? null,
        firstName: (row.first_name as string) ?? "",
        lastName: (row.last_name as string) ?? "",
        email: (row.email as string) ?? "",
        phone: (row.phone as string) ?? "",
        employeeStatus: (row.employee_status as EmployeeStatus | null) ?? null,
        orgRole: (row.org_role as OrganizationRole | null) ?? null,
        hasAppAccess,
        focusAreaIds: (row.focus_area_ids as number[]) ?? [],
        certificationId: (row.certification_id as number | null) ?? null,
        roleIds: (row.role_ids as number[]) ?? [],
        seniority: (row.seniority as number | null) ?? null,
        lastSignInAt: canSeeActivity ? ((row.last_sign_in_at as string | null) ?? null) : null,
        invitationStatus: (row.invitation_status as "pending" | "expired" | null) ?? null,
        scheduledDepartmentIds,
        scheduledDeptAdminIds,
        managementDepartmentIds,
        managementDeptAdminIds,
        departmentIds: managementDepartmentIds,
        deptAdminIds: managementDeptAdminIds,
        isManagementUser: hasAppAccess && managementDepartmentIds.length > 0,
        membershipUpdatedAt: (row.membership_updated_at as string | null) ?? null,
        adminPermissions: canSeePermissions
          ? ((row.membership_admin_permissions as AdminPermissions | null) ?? null)
          : null,
      } satisfies DirectoryPerson;
    });

    return NextResponse.json({
      directory,
      hasMore,
      nextOffset: hasMore ? offset + rows.length : null,
    });
  } catch (error) {
    logger.error({ error }, "organization directory GET failed");
    return NextResponse.json(
      { error: "We couldn't load the team directory. Refresh and try again." },
      { status: 500 },
    );
  }
}
