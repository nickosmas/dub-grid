import { NextResponse, type NextRequest } from "next/server";
import { mobilePeopleResponseSchema } from "@dubgrid/contracts";
import {
  loadMobilePeoplePayload,
  MobileApiAuthorizationError,
} from "@dubgrid/mobile-api-core";
import { fetchMobilePeople, requireMobileAuth } from "@/features/mobile/server";
import type { Employee } from "@/types";

export const dynamic = "force-dynamic";

type MobilePersonSource = Pick<
  Employee,
  | "id"
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
    firstName: person.firstName,
    lastName: person.lastName,
    employmentType: person.employmentType,
    phone: person.phone,
    email: person.email,
    status: person.status,
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
