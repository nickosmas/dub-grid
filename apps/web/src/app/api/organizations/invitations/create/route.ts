import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { canManageEmployees } from "@/app/api/employees/shared";
import type { AssignableOrganizationRole } from "@/types";

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

    const { data, error } = await serviceClient.rpc("send_invitation", {
      p_email: email,
      p_role: role as AssignableOrganizationRole,
      p_org_id: orgId,
      p_employee_id: employeeId ?? null,
      p_first_name: firstName ?? null,
      p_last_name: lastName ?? null,
      p_phone: phone ?? null,
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
