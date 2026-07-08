import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { optionalUsPhoneSchema, staffNameSchema } from "@dubgrid/contracts";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { canManageEmployees } from "@/app/api/employees/shared";
import {
  buildStaffValidationErrorResponse,
  getStaffFieldErrorsFromZod,
  validateStaffOrgReferences,
} from "@/lib/staff-validation";
import { API_ERRORS } from "@dubgrid/client-errors";

const patchSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  firstName: staffNameSchema.optional(),
  lastName: staffNameSchema.optional(),
  phone: optionalUsPhoneSchema.optional(),
  departmentIds: z.array(z.number().int()).optional(),
  deptAdminIds: z.array(z.number().int()).optional(),
});

export async function PATCH(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return buildStaffValidationErrorResponse(getStaffFieldErrorsFromZod(parsed.error));
  }

  const { orgId, userId, firstName, lastName, phone, departmentIds, deptAdminIds } = parsed.data;
  const serviceClient = getServiceClient();

  try {
    const hasPermission = await canManageEmployees(serviceClient, user.id, orgId);
    if (!hasPermission) {
      return NextResponse.json({ error: API_ERRORS.FORBIDDEN }, { status: 403 });
    }

    const referenceErrors = await validateStaffOrgReferences(serviceClient, orgId, {
      departmentIds,
      deptAdminIds,
    });
    if (Object.keys(referenceErrors).length > 0) {
      return buildStaffValidationErrorResponse(referenceErrors);
    }

    if (firstName !== undefined || lastName !== undefined) {
      const profileUpdate: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (firstName !== undefined) profileUpdate.first_name = firstName;
      if (lastName !== undefined) profileUpdate.last_name = lastName;
      const { error } = await serviceClient.from("profiles").update(profileUpdate).eq("id", userId);
      if (error) throw error;
    }

    if (phone !== undefined || departmentIds !== undefined || deptAdminIds !== undefined) {
      const membershipUpdate: Record<string, unknown> = {};
      if (phone !== undefined) membershipUpdate.phone = phone;
      if (departmentIds !== undefined) {
        membershipUpdate.department_ids = departmentIds;
        if (deptAdminIds !== undefined) {
          const departmentIdSet = new Set(departmentIds);
          membershipUpdate.dept_admin_ids = deptAdminIds.filter((id) => departmentIdSet.has(id));
        }
      } else if (deptAdminIds !== undefined) {
        membershipUpdate.dept_admin_ids = deptAdminIds;
      }

      const { error } = await serviceClient
        .from("organization_memberships")
        .update(membershipUpdate)
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .is("archived_at", null);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("organization app-only-user PATCH failed", error);
    return NextResponse.json({ error: "Failed to update app-only user" }, { status: 500 });
  }
}
