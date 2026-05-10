import { NextRequest, NextResponse } from "next/server";
import {
  normalizeOptionalUsPhone,
  normalizeRequiredStaffEmail,
  normalizeStaffName,
} from "@dubgrid/contracts";
import { z } from "zod";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { canManageEmployees } from "@/app/api/employees/shared";
import type { AssignableOrganizationRole } from "@/types";
import {
  buildStaffValidationErrorResponse,
  getStaffFieldErrors,
} from "@/lib/staff-validation";

const postSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["user", "admin"]),
  orgId: z.string().uuid(),
  employeeId: z.string().uuid().optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  departmentIds: z.array(z.number().int()).optional(),
  deptAdminIds: z.array(z.number().int()).optional(),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const serviceClient = getServiceClient();
  const {
    email,
    role,
    orgId,
    employeeId,
    firstName,
    lastName,
    phone,
    departmentIds,
    deptAdminIds,
  } = parsed.data;

  try {
    const hasPermission = await canManageEmployees(serviceClient, user.id, orgId);
    if (!hasPermission) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const fieldErrors = getStaffFieldErrors({
      email,
      ...(firstName !== undefined ? { firstName } : {}),
      ...(lastName !== undefined ? { lastName } : {}),
      ...(phone !== undefined ? { phone } : {}),
    });
    if (Object.keys(fieldErrors).length > 0) {
      return buildStaffValidationErrorResponse(fieldErrors);
    }

    const { data, error } = await serviceClient.rpc("send_invitation", {
      p_email: normalizeRequiredStaffEmail(email),
      p_role: role as AssignableOrganizationRole,
      p_org_id: orgId,
      p_employee_id: employeeId ?? null,
      p_first_name:
        typeof firstName === "string"
          ? firstName.trim()
            ? normalizeStaffName(firstName)
            : null
          : null,
      p_last_name:
        typeof lastName === "string"
          ? lastName.trim()
            ? normalizeStaffName(lastName)
            : null
          : null,
      p_phone:
        typeof phone === "string" ? normalizeOptionalUsPhone(phone) || null : null,
      p_department_ids: departmentIds ?? [],
      p_dept_admin_ids: deptAdminIds ?? [],
    });
    if (error) throw error;

    return NextResponse.json({
      invitationId: data.invitation_id as string,
      token: data.token as string,
      expiresAt: data.expires_at as string,
    });
  } catch (error) {
    console.error("organization invitation create POST failed", error);
    return NextResponse.json(
      { error: "Failed to create invitation" },
      { status: 500 },
    );
  }
}
