import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import type { DirectoryPerson, EmployeeStatus, OrganizationRole } from "@/types";

const searchSchema = z.object({
  orgId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  try {
    const parsed = searchSchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
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
    const { data, error } = await serviceClient.rpc("get_org_directory", {
      // Use the auth-effective orgId — when the caller is in sandbox
      // mode, this is the sandbox id, not the body's real-org id.
      p_org_id: orgAuth.orgId,
    });
    if (error) throw error;

    const directory = (data ?? []).map((row: Record<string, unknown>) => {
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
        userId: (row.user_id as string | null) ?? null,
        firstName: (row.first_name as string) ?? "",
        lastName: (row.last_name as string) ?? "",
        email: (row.email as string) ?? "",
        phone: (row.phone as string) ?? "",
        employeeStatus: (row.employee_status as EmployeeStatus | null) ?? null,
        orgRole: (row.org_role as OrganizationRole | null) ?? null,
        hasAppAccess,
        focusAreaIds: ((row.focus_area_ids as number[]) ?? []),
        certificationId: (row.certification_id as number | null) ?? null,
        roleIds: ((row.role_ids as number[]) ?? []),
        seniority: (row.seniority as number | null) ?? null,
        lastSignInAt: (row.last_sign_in_at as string | null) ?? null,
        invitationStatus: (row.invitation_status as "pending" | "expired" | null) ?? null,
        scheduledDepartmentIds,
        scheduledDeptAdminIds,
        managementDepartmentIds,
        managementDeptAdminIds,
        departmentIds: managementDepartmentIds,
        deptAdminIds: managementDeptAdminIds,
        isManagementUser: hasAppAccess && managementDepartmentIds.length > 0,
      } satisfies DirectoryPerson;
    });

    return NextResponse.json({ directory });
  } catch (error) {
    console.error("organization directory GET failed", error);
    return NextResponse.json(
      { error: "Failed to load organization directory" },
      { status: 500 },
    );
  }
}
