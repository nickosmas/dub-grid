import { NextResponse, type NextRequest } from "next/server";
import {
  mobilePersonResponseSchema,
  mobilePersonUpdateBodySchema,
  mobilePersonUpdateResponseSchema,
} from "@dubgrid/contracts";
import { insertMobileAuditLogEntry, updateMobileEmployeeDetailsRow } from "@dubgrid/data-access";
import { requireMobileAuth } from "@/features/mobile/server";
import { loadMobilePersonWithAccess } from "@/features/mobile/server/person-access";
import { getEmployeeContactConflict } from "@/lib/employee-contact-conflicts";
import {
  buildStaffValidationErrorResponse,
  getStaffFieldErrorsFromZod,
  validateStaffOrgReferences,
} from "@/lib/staff-validation";

export const dynamic = "force-dynamic";

function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers?.get("x-forwarded-for") ?? null;
  if (!forwarded) {
    return null;
  }

  return forwarded.split(",")[0]?.trim() || null;
}

async function loadMobilePerson(
  serviceClient: Parameters<typeof loadMobilePersonWithAccess>[0],
  orgId: string,
  employeeId: string,
) {
  return (await loadMobilePersonWithAccess(serviceClient, orgId, employeeId))?.person ?? null;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) {
    return auth.response;
  }

  if (!auth.permissions.canManageEmployees && !auth.permissions.canViewStaff) {
    return NextResponse.json(
      { error: "You don't have permission to view that staff profile." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const person = await loadMobilePerson(auth.serviceClient, auth.currentOrg.id, id);
  if (!person) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  if (!auth.permissions.canManageEmployees) {
    if (person.status !== "active") {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Management users appear in everyone's directory, but their profile
    // view stays manager-only.
    if (person.managementDepartmentIds.length > 0) {
      return NextResponse.json(
        { error: "You don't have permission to view that staff profile." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      mobilePersonResponseSchema.parse({
        person: {
          ...person,
          contactNotes: "",
          departmentIds: [],
          deptAdminIds: [],
          managementDepartmentIds: [],
          managementDeptAdminIds: [],
          pendingInvitation: null,
          roleIds: [],
          statusNote: "",
          userId: null,
        },
      }),
    );
  }

  return NextResponse.json(
    mobilePersonResponseSchema.parse({
      person,
    }),
  );
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) {
    return auth.response;
  }

  if (!auth.permissions.canManageEmployees) {
    return NextResponse.json(
      { error: "You don't have permission to update staff profiles." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that staff update. Try again." },
      { status: 400 },
    );
  }

  const parsed = mobilePersonUpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    return buildStaffValidationErrorResponse(getStaffFieldErrorsFromZod(parsed.error));
  }

  const { id } = await context.params;
  const currentPerson = await loadMobilePerson(auth.serviceClient, auth.currentOrg.id, id);
  if (!currentPerson) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (currentPerson.status === "removed") {
    return NextResponse.json({ error: "Removed employees can't be edited." }, { status: 400 });
  }
  if (currentPerson.version !== parsed.data.expectedVersion) {
    return NextResponse.json(
      {
        error: "Employee details changed elsewhere. Review the latest values before saving again.",
        code: "EMPLOYEE_CONFLICT",
        person: currentPerson,
      },
      { status: 409 },
    );
  }

  const referenceErrors = await validateStaffOrgReferences(auth.serviceClient, auth.currentOrg.id, {
    certificationId: parsed.data.certificationId,
    departmentIds: parsed.data.departmentIds,
    focusAreaIds: parsed.data.focusAreaIds,
    requireFocusArea: true,
    roleIds: parsed.data.roleIds,
  });
  if (Object.keys(referenceErrors).length > 0) {
    return buildStaffValidationErrorResponse(referenceErrors);
  }

  let updatedRow;
  try {
    updatedRow = await updateMobileEmployeeDetailsRow(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      employeeId: id,
      expectedVersion: parsed.data.expectedVersion,
      firstName: parsed.data.firstName.trim(),
      lastName: parsed.data.lastName.trim(),
      phone: parsed.data.phone.trim(),
      email: parsed.data.email.trim(),
      contactNotes: parsed.data.contactNotes.trim(),
      employmentType: parsed.data.employmentType,
      certificationId: parsed.data.certificationId,
      focusAreaIds: parsed.data.focusAreaIds,
      roleIds: parsed.data.roleIds,
      departmentIds: parsed.data.departmentIds,
    });
  } catch (error) {
    const contactConflict = getEmployeeContactConflict(error);
    if (contactConflict) {
      return NextResponse.json(contactConflict, { status: 409 });
    }
    throw error;
  }

  if (!updatedRow) {
    const latestPerson = await loadMobilePerson(auth.serviceClient, auth.currentOrg.id, id);
    return NextResponse.json(
      {
        error: "Employee details changed elsewhere. Review the latest values before saving again.",
        code: "EMPLOYEE_CONFLICT",
        person: latestPerson ?? currentPerson,
      },
      { status: 409 },
    );
  }

  await insertMobileAuditLogEntry(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action: "employee.updated",
    resource_type: "employee",
    resource_id: id,
    details: {
      changedFields: [
        "firstName",
        "lastName",
        "phone",
        "email",
        "contactNotes",
        "employmentType",
        "certificationId",
        "focusAreaIds",
        "roleIds",
        "departmentIds",
      ],
    },
    ip_address: getRequestIp(req),
    user_agent: req.headers?.get("user-agent") ?? null,
  });

  const person = await loadMobilePerson(auth.serviceClient, auth.currentOrg.id, id);
  return NextResponse.json(
    mobilePersonUpdateResponseSchema.parse({
      success: true,
      person,
    }),
  );
}
