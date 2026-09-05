import { NextResponse, type NextRequest } from "next/server";
import {
  mobilePersonResponseSchema,
  mobilePersonUpdateBodySchema,
  mobilePersonUpdateResponseSchema,
  type MobilePerson,
} from "@dubgrid/contracts";
import { updateMobileEmployeeDetailsRow } from "@dubgrid/data-access";
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

function sameNumberSet(left: number[], right: number[]): boolean {
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

function employeeUpdateAuditDetails(
  currentPerson: MobilePerson,
  update: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    contactNotes: string;
    employmentType: "full_time" | "part_time";
    certificationId: number | null;
    focusAreaIds: number[];
    roleIds: number[];
    departmentIds: number[];
  },
) {
  const changedFields: string[] = [];
  const from: Record<string, unknown> = {};
  const to: Record<string, unknown> = {};
  const add = (field: string, before: unknown, after: unknown, changed: boolean) => {
    if (!changed) return;
    changedFields.push(field);
    from[field] = before;
    to[field] = after;
  };

  add(
    "firstName",
    currentPerson.firstName,
    update.firstName,
    currentPerson.firstName !== update.firstName,
  );
  add(
    "lastName",
    currentPerson.lastName,
    update.lastName,
    currentPerson.lastName !== update.lastName,
  );
  add("phone", currentPerson.phone, update.phone, currentPerson.phone !== update.phone);
  add("email", currentPerson.email, update.email, currentPerson.email !== update.email);
  add(
    "contactNotes",
    currentPerson.contactNotes,
    update.contactNotes,
    currentPerson.contactNotes !== update.contactNotes,
  );
  add(
    "employmentType",
    currentPerson.employmentType,
    update.employmentType,
    currentPerson.employmentType !== update.employmentType,
  );
  add(
    "certification",
    currentPerson.certificationId,
    update.certificationId,
    currentPerson.certificationId !== update.certificationId,
  );
  add(
    "focusAreas",
    currentPerson.focusAreaIds,
    update.focusAreaIds,
    !sameNumberSet(currentPerson.focusAreaIds, update.focusAreaIds),
  );
  add(
    "roles",
    currentPerson.roleIds,
    update.roleIds,
    !sameNumberSet(currentPerson.roleIds, update.roleIds),
  );
  add(
    "departments",
    currentPerson.departmentIds,
    update.departmentIds,
    !sameNumberSet(currentPerson.departmentIds, update.departmentIds),
  );

  return { changedFields, from, to };
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
    // Self-service is owned by /profile. Keep the direct person endpoint from
    // recreating a second, sanitized view of the signed-in user's own record.
    if (person.userId === auth.user.id) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

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
          // The people list already withholds these from a non-manager
          // (packages/mobile-api-core/src/read.ts); the detail screen was
          // handing back the same coworker's address and mobile anyway.
          email: "",
          phone: "",
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

  // Someone with management access doesn't need at least one focus area to
  // fall back on — they can come off the schedule entirely and keep managing.
  const hasManagementAccess = currentPerson.managementDepartmentIds.length > 0;
  const referenceErrors = await validateStaffOrgReferences(auth.serviceClient, auth.currentOrg.id, {
    certificationId: parsed.data.certificationId,
    currentCertificationId: currentPerson.certificationId,
    departmentIds: parsed.data.departmentIds,
    focusAreaIds: parsed.data.focusAreaIds,
    requireFocusArea: !hasManagementAccess,
    roleIds: parsed.data.roleIds,
  });
  if (Object.keys(referenceErrors).length > 0) {
    return buildStaffValidationErrorResponse(referenceErrors);
  }

  const update = {
    firstName: parsed.data.firstName.trim(),
    lastName: parsed.data.lastName.trim(),
    phone: parsed.data.phone.trim(),
    email: parsed.data.email.trim(),
    contactNotes: parsed.data.contactNotes.trim(),
    employmentType: parsed.data.employmentType ?? currentPerson.employmentType,
    certificationId: parsed.data.certificationId,
    focusAreaIds: parsed.data.focusAreaIds,
    roleIds: parsed.data.roleIds,
    departmentIds: parsed.data.departmentIds,
  };
  const auditDetails = employeeUpdateAuditDetails(currentPerson, update);

  let updatedRow;
  try {
    updatedRow = await updateMobileEmployeeDetailsRow(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      employeeId: id,
      expectedVersion: parsed.data.expectedVersion,
      audit: {
        actorEmail: auth.user.email ?? null,
        actorId: auth.user.id,
        ...(auditDetails.changedFields.length > 0 ? { details: auditDetails } : {}),
        ipAddress: getRequestIp(req),
        userAgent: req.headers?.get("user-agent") ?? null,
      },
      ...update,
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

  const person = await loadMobilePerson(auth.serviceClient, auth.currentOrg.id, id);
  return NextResponse.json(
    mobilePersonUpdateResponseSchema.parse({
      success: true,
      person,
    }),
  );
}
