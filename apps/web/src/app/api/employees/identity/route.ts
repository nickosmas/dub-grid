import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { optionalUsPhoneSchema, staffNameSchema } from "@dubgrid/contracts";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { canManageEmployees } from "@/app/api/employees/shared";
import { getEmployeeContactConflict } from "@/lib/employee-contact-conflicts";
import {
  buildStaffValidationErrorResponse,
  getStaffFieldErrorsFromZod,
} from "@/lib/staff-validation";

const patchSchema = z.object({
  employeeId: z.string().uuid(),
  orgId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  firstName: staffNameSchema,
  lastName: staffNameSchema,
  phone: optionalUsPhoneSchema,
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
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return buildStaffValidationErrorResponse(
      getStaffFieldErrorsFromZod(parsed.error),
    );
  }

  const { employeeId, orgId, userId, firstName, lastName, phone } = parsed.data;
  const serviceClient = getServiceClient();

  try {
    const hasPermission = await canManageEmployees(
      serviceClient,
      user.id,
      orgId,
    );
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const { error } = await serviceClient
      .from("employees")
      .update({
        first_name: firstName,
        last_name: lastName,
        phone,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", orgId)
      .eq("id", employeeId);
    if (error) throw error;

    if (userId) {
      const profileResult = await serviceClient
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (profileResult.error) throw profileResult.error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const contactConflict = getEmployeeContactConflict(error);
    if (contactConflict) {
      return NextResponse.json(contactConflict, { status: 409 });
    }

    console.error("employee identity PATCH failed", error);
    return NextResponse.json(
      { error: "Failed to update employee identity" },
      { status: 500 },
    );
  }
}
