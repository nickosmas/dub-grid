import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  optionalStaffEmailSchema,
  optionalUsPhoneSchema,
  staffNameSchema,
} from "@dubgrid/contracts";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { getServiceClient } from "@/lib/supabase-service";
import { canManageEmployees } from "@/app/api/employees/shared";
import { getEmployeeContactConflict } from "@/lib/employee-contact-conflicts";
import {
  buildStaffValidationErrorResponse,
  getStaffFieldErrorsFromZod,
} from "@/lib/staff-validation";
import { rowToEmployee } from "@/lib/db/mappers";
import type { DbEmployee } from "@/lib/db/types";
import { EMPLOYEE_COLS } from "@/lib/db/shared";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  employeeId: z.string().uuid(),
  orgId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  firstName: staffNameSchema,
  lastName: staffNameSchema,
  phone: optionalUsPhoneSchema,
  email: optionalStaffEmailSchema.optional(),
  expectedVersion: z.number().int().min(0),
});

function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

function buildConflictResponse(employee: ReturnType<typeof rowToEmployee>) {
  return NextResponse.json(
    {
      error: "Employee details changed elsewhere. Refresh and try again.",
      code: "EMPLOYEE_IDENTITY_CONFLICT",
      employee,
    },
    { status: 409 },
  );
}

export async function PATCH(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
  if (misconfigured) {
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) } },
    );
  }

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

  const { employeeId, userId, firstName, lastName, phone, email, expectedVersion } = parsed.data;
  // Effective (sandbox-redirected) org; resolved inside the try, declared here
  // so the catch block can reference it for logging. (H-1)
  let orgId = parsed.data.orgId;
  const serviceClient = getServiceClient();

  try {
    // Resolve the effective org: if the caller is in sandbox mode, route the
    // check AND the mutation to their sandbox, never the raw request orgId
    // (otherwise a sandbox user could mutate the real org). See H-1.
    orgId = await resolveEffectiveOrgId(req, user.id, parsed.data.orgId);

    const hasPermission = await canManageEmployees(serviceClient, user.id, orgId);
    if (!hasPermission) {
      return NextResponse.json({ error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES }, { status: 403 });
    }

    const { data: currentRow, error: currentError } = await serviceClient
      .from("employees")
      .select(EMPLOYEE_COLS)
      .eq("id", employeeId)
      .eq("org_id", orgId)
      .single();

    if (currentError) throw currentError;

    const currentEmployee = rowToEmployee(currentRow as DbEmployee);

    if (currentEmployee.version !== expectedVersion) {
      return buildConflictResponse(currentEmployee);
    }

    const update: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName,
      phone,
      // Only PATCH the email when the caller explicitly sent one — keeps
      // legacy callers (which don't set email) from clearing the field.
      ...(email !== undefined ? { email } : {}),
      updated_at: new Date().toISOString(),
      version: expectedVersion + 1,
    };

    const { data: updatedRow, error: updateError } = await serviceClient
      .from("employees")
      .update(update)
      .eq("id", employeeId)
      .eq("org_id", orgId)
      .eq("version", expectedVersion)
      .select(EMPLOYEE_COLS)
      .maybeSingle();

    if (updateError) throw updateError;

    if (!updatedRow) {
      const { data: latestRow, error: latestError } = await serviceClient
        .from("employees")
        .select(EMPLOYEE_COLS)
        .eq("id", employeeId)
        .eq("org_id", orgId)
        .single();
      if (latestError) throw latestError;
      return buildConflictResponse(rowToEmployee(latestRow as DbEmployee));
    }

    const updatedEmployee = rowToEmployee(updatedRow as DbEmployee);

    // Mirror first/last name to the linked profile so display names stay in
    // sync across the app (people list, schedule chips, audit log actor labels).
    if (userId) {
      const { error: profileError } = await serviceClient
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (profileError) throw profileError;
    }

    const changedFields: string[] = [];
    if (currentEmployee.firstName !== firstName) changedFields.push("firstName");
    if (currentEmployee.lastName !== lastName) changedFields.push("lastName");
    if ((currentEmployee.phone ?? "") !== (phone ?? "")) changedFields.push("phone");
    if (email !== undefined && (currentEmployee.email ?? "") !== (email ?? "")) {
      changedFields.push("email");
    }

    if (changedFields.length > 0) {
      const { error: auditError } = await serviceClient.from("audit_log").insert({
        org_id: orgId,
        actor_id: user.id,
        actor_email: user.email ?? null,
        action: "employee.updated",
        resource_type: "employee",
        resource_id: employeeId,
        details: {
          firstName,
          lastName,
          changedFields,
          from: {
            firstName: currentEmployee.firstName,
            lastName: currentEmployee.lastName,
            phone: currentEmployee.phone ?? "",
            ...(email !== undefined ? { email: currentEmployee.email ?? "" } : {}),
          },
          to: {
            firstName,
            lastName,
            phone: phone ?? "",
            ...(email !== undefined ? { email: email ?? "" } : {}),
          },
        },
        ip_address: getRequestIp(req),
        user_agent: req.headers.get("user-agent"),
      });

      if (auditError) {
        logger.error(
          { error: auditError, orgId, employeeId },
          "Employee identity audit log write failed",
        );
      }
    }

    return NextResponse.json({ success: true, employee: updatedEmployee });
  } catch (error) {
    const contactConflict = getEmployeeContactConflict(error);
    if (contactConflict) {
      return NextResponse.json(contactConflict, { status: 409 });
    }

    Sentry.captureException(error, { extra: { context: "employees/identity", employeeId, orgId } });
    logger.error({ error, employeeId, orgId }, "Employee identity update failed");
    return NextResponse.json({ error: "Failed to update employee identity" }, { status: 500 });
  }
}
