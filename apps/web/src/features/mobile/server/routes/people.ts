import { NextResponse, type NextRequest } from "next/server";
import {
  mobilePeopleResponseSchema,
  mobilePersonCreateBodySchema,
  mobilePersonCreateResponseSchema,
  type MobilePerson,
} from "@dubgrid/contracts";
import { loadMobilePeoplePayload, MobileApiAuthorizationError } from "@dubgrid/mobile-api-core";
import { insertMobileAuditLogEntry } from "@dubgrid/data-access";
import { fetchMobilePeople, requireMobileAuth } from "@/features/mobile/server";
import { employeeToRow, rowToEmployee } from "@/lib/db/mappers";
import { EMPLOYEE_COLS } from "@/lib/db/shared";
import { getEmployeeContactConflict } from "@/lib/employee-contact-conflicts";
import {
  buildStaffValidationErrorResponse,
  getStaffFieldErrorsFromZod,
  validateStaffOrgReferences,
} from "@/lib/staff-validation";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import type { Employee } from "@/types";

export const dynamic = "force-dynamic";

type MobilePersonSource = Pick<
  Employee,
  | "id"
  | "employeeNumber"
  | "firstName"
  | "lastName"
  | "employmentType"
  | "phone"
  | "email"
  | "status"
  | "focusAreaIds"
  | "certificationId"
  | "roleIds"
  | "seniority"
  | "departmentIds"
  | "deptAdminIds"
  | "contactNotes"
  | "statusChangedAt"
  | "statusNote"
  | "userId"
  | "version"
> & {
  managementDepartmentIds?: number[];
  managementDeptAdminIds?: number[];
  orgRole?: MobilePerson["orgRole"];
  pendingInvitation?: {
    id: string;
    email: string;
    expiresAt: string;
    updatedAt: string | null;
  } | null;
};

export function mapEmployeeToMobilePerson(person: MobilePersonSource) {
  return {
    id: person.id,
    employeeNumber: person.employeeNumber ?? 0,
    firstName: person.firstName,
    lastName: person.lastName,
    employmentType: person.employmentType,
    phone: person.phone,
    email: person.email,
    status: person.status,
    orgRole: person.orgRole ?? null,
    certificationId: person.certificationId,
    roleIds: person.roleIds,
    seniority: person.seniority,
    focusAreaIds: person.focusAreaIds,
    departmentIds: person.departmentIds,
    deptAdminIds: person.deptAdminIds,
    managementDepartmentIds: person.managementDepartmentIds ?? [],
    managementDeptAdminIds: person.managementDeptAdminIds ?? [],
    contactNotes: person.contactNotes,
    statusChangedAt: person.statusChangedAt,
    statusNote: person.statusNote,
    userId: person.userId,
    version: person.version,
    pendingInvitation: person.pendingInvitation ?? null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  try {
    const payload = await loadMobilePeoplePayload(auth, {
      fetchMobilePeople,
      mapEmployeeToMobilePerson,
    });

    return NextResponse.json(mobilePeopleResponseSchema.parse(payload));
  } catch (error) {
    if (error instanceof MobileApiAuthorizationError) {
      return NextResponse.json(
        { error: "You don't have permission to view the staff directory." },
        { status: 403 },
      );
    }

    throw error;
  }
}

function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  if (!auth.permissions.canManageEmployees) {
    return NextResponse.json(
      { error: "You don't have permission to add staff members." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that staff member. Try again." },
      { status: 400 },
    );
  }

  const parsed = mobilePersonCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return buildStaffValidationErrorResponse(getStaffFieldErrorsFromZod(parsed.error));
  }

  const referenceErrors = await validateStaffOrgReferences(auth.serviceClient, auth.currentOrg.id, {
    certificationId: parsed.data.certificationId,
    focusAreaIds: parsed.data.focusAreaIds,
    requireFocusArea: true,
  });
  if (Object.keys(referenceErrors).length > 0) {
    return buildStaffValidationErrorResponse(referenceErrors);
  }

  const { data: maxSeniorityRow } = await auth.serviceClient
    .from("employees")
    .select("seniority")
    .eq("org_id", auth.currentOrg.id)
    .order("seniority", { ascending: false })
    .limit(1)
    .maybeSingle();
  const seniority = ((maxSeniorityRow as { seniority: number } | null)?.seniority ?? 0) + 1;

  let insertedRow;
  try {
    const { data: row, error } = await auth.serviceClient
      .from("employees")
      .insert(
        employeeToRow(
          {
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
            employmentType: parsed.data.employmentType,
            certificationId: parsed.data.certificationId,
            roleIds: [],
            seniority,
            focusAreaIds: parsed.data.focusAreaIds,
            phone: "",
            email: parsed.data.email,
            contactNotes: "",
            departmentIds: [],
            deptAdminIds: [],
            status: "active",
            statusChangedAt: null,
            statusNote: "",
            userId: null,
            version: 0,
          },
          auth.currentOrg.id,
        ),
      )
      .select(EMPLOYEE_COLS)
      .single();
    if (error) throw error;
    insertedRow = row;
  } catch (error) {
    const contactConflict = getEmployeeContactConflict(error);
    if (contactConflict) {
      return NextResponse.json(contactConflict, { status: 409 });
    }
    throw error;
  }

  const employee = rowToEmployee(insertedRow);

  void dispatchNotificationEvent(auth.user.id, {
    action: "employee_created",
    orgId: auth.currentOrg.id,
    empId: employee.id,
  });

  await insertMobileAuditLogEntry(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action: "employee.created",
    resource_type: "employee",
    resource_id: employee.id,
    details: {
      firstName: employee.firstName,
      lastName: employee.lastName,
    },
    ip_address: getRequestIp(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json(
    mobilePersonCreateResponseSchema.parse({
      success: true,
      person: mapEmployeeToMobilePerson(employee),
    }),
  );
}
