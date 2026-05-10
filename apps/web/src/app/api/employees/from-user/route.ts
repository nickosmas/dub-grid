import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  optionalUsPhoneSchema,
  requiredStaffEmailSchema,
  staffNameSchema,
  staffNotesSchema,
} from "@dubgrid/contracts";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { hasCompleteName, namesMatch } from "@/lib/account-linking";
import { getServiceClient } from "@/lib/supabase-service";
import { cacheDel, CacheKey } from "@/lib/cache";
import { rowToEmployee } from "@/lib/db/mappers";
import type { DbEmployee } from "@/lib/db/types";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import {
  canManageEmployees,
  fetchProfileName,
  nameMismatchResponse,
} from "@/app/api/employees/shared";
import { getEmployeeContactConflict } from "@/lib/employee-contact-conflicts";
import {
  buildStaffValidationErrorResponse,
  getStaffFieldErrorsFromZod,
  validateStaffOrgReferences,
} from "@/lib/staff-validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  firstName: staffNameSchema,
  lastName: staffNameSchema,
  email: requiredStaffEmailSchema,
  phone: optionalUsPhoneSchema.optional().default(""),
  certificationId: z.number().int().nullable(),
  focusAreaIds: z.array(z.number().int()).min(1),
  roleIds: z.array(z.number().int()).default([]),
  contactNotes: staffNotesSchema.optional().default(""),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { limited, reset, misconfigured } = await checkRateLimit(
    apiLimiter,
    user.id,
  );
  if (misconfigured) {
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return buildStaffValidationErrorResponse(
      getStaffFieldErrorsFromZod(parsed.error),
    );
  }

  const {
    orgId,
    userId,
    firstName,
    lastName,
    email,
    phone,
    certificationId,
    focusAreaIds,
    roleIds,
    contactNotes,
  } = parsed.data;

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

    const referenceErrors = await validateStaffOrgReferences(
      serviceClient,
      orgId,
      {
        certificationId,
        focusAreaIds,
        requireFocusArea: true,
        roleIds,
      },
    );
    if (Object.keys(referenceErrors).length > 0) {
      return buildStaffValidationErrorResponse(referenceErrors);
    }

    const [
      { data: membership },
      { data: existingLinkedEmployees },
      { data: seniorityRow },
      profileName,
    ] = await Promise.all([
      serviceClient
        .from("organization_memberships")
        .select("user_id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .maybeSingle(),
      serviceClient
        .from("employees")
        .select("id")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .limit(1),
      serviceClient
        .from("employees")
        .select("seniority")
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("seniority", { ascending: false })
        .limit(1)
        .maybeSingle(),
      fetchProfileName(serviceClient, userId),
    ]);

    if (!membership) {
      return NextResponse.json(
        { error: "User is not an active member of this organization" },
        { status: 404 },
      );
    }
    if ((existingLinkedEmployees?.length ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "User is already linked to a schedule employee in this organization",
        },
        { status: 409 },
      );
    }
    if (!hasCompleteName(profileName)) {
      return nameMismatchResponse(
        {
          employeeId: null,
          userId,
          employeeFirstName: firstName,
          employeeLastName: lastName,
          accountFirstName: profileName.firstName ?? "",
          accountLastName: profileName.lastName ?? "",
        },
        "The user account must have a first and last name before it can be added to the schedule.",
      );
    }
    if (!namesMatch({ firstName, lastName }, profileName)) {
      return nameMismatchResponse({
        employeeId: null,
        userId,
        employeeFirstName: firstName,
        employeeLastName: lastName,
        accountFirstName: profileName.firstName ?? "",
        accountLastName: profileName.lastName ?? "",
      });
    }

    const nextSeniority = ((seniorityRow?.seniority as number | null) ?? 0) + 1;
    const { data: row, error } = await serviceClient
      .from("employees")
      .insert({
        org_id: orgId,
        user_id: userId,
        first_name: profileName.firstName,
        last_name: profileName.lastName,
        email,
        phone,
        certification_id: certificationId,
        focus_area_ids: focusAreaIds,
        role_ids: roleIds,
        seniority: nextSeniority,
        contact_notes: contactNotes,
        department_ids: [],
        dept_admin_ids: [],
        created_by: user.id,
        updated_by: user.id,
      })
      .select(
        "id, org_id, first_name, last_name, employment_type, status, status_changed_at, status_note, certification_id, role_ids, seniority, focus_area_ids, phone, email, contact_notes, archived_at, user_id, department_ids, dept_admin_ids, version",
      )
      .single();

    if (error || !row) {
      throw error ?? new Error("Employee creation failed");
    }

    await Promise.all([
      cacheDel(
        CacheKey.employees(orgId),
        CacheKey.orgDirectory(orgId),
        CacheKey.tenantStats(),
      ),
      serviceClient.from("audit_log").insert({
        org_id: orgId,
        actor_id: user.id,
        actor_email: user.email ?? null,
        action: "employee.created",
        resource_type: "employee",
        resource_id: (row as DbEmployee).id,
        details: {
          firstName: profileName.firstName ?? "",
          lastName: profileName.lastName ?? "",
          linkedUserId: userId,
          createdFrom: "org_user",
        },
      }),
    ]);

    return NextResponse.json({ employee: rowToEmployee(row as DbEmployee) });
  } catch (err) {
    const contactConflict = getEmployeeContactConflict(err);
    if (contactConflict) {
      return NextResponse.json(contactConflict, { status: 409 });
    }

    Sentry.captureException(err, {
      extra: { context: "employees/from-user", orgId, userId },
    });
    logger.error(
      { error: err, orgId, userId },
      "Failed to create employee from org user",
    );
    return NextResponse.json(
      { error: "Failed to add management user to the schedule" },
      { status: 500 },
    );
  }
}
