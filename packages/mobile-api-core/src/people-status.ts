import type { MobilePerson, MobilePersonStatusUpdateBody } from "@dubgrid/contracts";
import type { Employee } from "@dubgrid/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MobileApiAuthorizationError } from "./read";

type PeopleStatusContext = {
  currentOrg: {
    id: string;
  };
  permissions: {
    canManageEmployees: boolean;
  };
  serviceClient: SupabaseClient;
  user: {
    id: string;
    email?: string | null;
  };
};

type FetchEmployeeById = (
  serviceClient: SupabaseClient,
  orgId: string,
  employeeId: string,
) => Promise<Employee | null>;

type UpdateEmployeeStatus = (
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId: string;
    expectedVersion: number;
    status: Employee["status"];
    statusNote: string;
    statusChangedAt: string;
    archivedAt?: string | null;
  },
) => Promise<Employee | null>;

type InsertAuditLog = (
  serviceClient: SupabaseClient,
  input: {
    org_id: string;
    actor_id: string;
    actor_email: string | null;
    action: string;
    resource_type: string;
    resource_id: string;
    details: Record<string, unknown>;
    ip_address: string | null;
    user_agent: string | null;
  },
) => Promise<void>;

type MapEmployeeToMobilePerson = (employee: Employee) => MobilePerson;

type PeopleStatusResult =
  | {
      kind: "not_found";
      error: string;
      status: 404;
    }
  | {
      kind: "conflict";
      error: string;
      code: "EMPLOYEE_STATUS_CONFLICT";
      person: MobilePerson;
      status: 409;
    }
  | {
      kind: "latest_unavailable";
      error: string;
      status: 500;
    }
  | {
      kind: "updated";
      person: MobilePerson;
      status: 200;
    };

export async function updateMobilePersonStatus(
  auth: PeopleStatusContext,
  input: {
    employeeId: string;
    body: MobilePersonStatusUpdateBody;
    requestIp: string | null;
    userAgent: string | null;
  },
  deps: {
    fetchEmployeeById: FetchEmployeeById;
    updateEmployeeStatus: UpdateEmployeeStatus;
    insertAuditLog: InsertAuditLog;
    mapEmployeeToMobilePerson: MapEmployeeToMobilePerson;
  },
): Promise<PeopleStatusResult> {
  if (!auth.permissions.canManageEmployees) {
    throw new MobileApiAuthorizationError();
  }

  const currentEmployee = await deps.fetchEmployeeById(
    auth.serviceClient,
    auth.currentOrg.id,
    input.employeeId,
  );

  if (!currentEmployee) {
    return {
      kind: "not_found",
      error: "Employee not found",
      status: 404,
    };
  }

  if (currentEmployee.version !== input.body.expectedVersion) {
    return {
      kind: "conflict",
      error:
        "Employee status changed elsewhere. Review the latest values before saving again.",
      code: "EMPLOYEE_STATUS_CONFLICT",
      person: deps.mapEmployeeToMobilePerson(currentEmployee),
      status: 409,
    };
  }

  const now = new Date().toISOString();
  const nextStatus =
    input.body.action === "bench" ? "benched" : "active";
  const nextStatusNote =
    input.body.action === "bench" ? (input.body.note ?? "") : "";
  const action =
    input.body.action === "bench" ? "employee.benched" : "employee.activated";

  const updatedEmployee = await deps.updateEmployeeStatus(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    employeeId: input.employeeId,
    expectedVersion: input.body.expectedVersion,
    status: nextStatus,
    statusNote: nextStatusNote,
    statusChangedAt: now,
    archivedAt: input.body.action === "activate" ? null : undefined,
  });

  if (!updatedEmployee) {
    const latestEmployee = await deps.fetchEmployeeById(
      auth.serviceClient,
      auth.currentOrg.id,
      input.employeeId,
    );

    if (!latestEmployee) {
      return {
        kind: "latest_unavailable",
        error: "We couldn't load the latest employee state.",
        status: 500,
      };
    }

    return {
      kind: "conflict",
      error:
        "Employee status changed elsewhere. Review the latest values before saving again.",
      code: "EMPLOYEE_STATUS_CONFLICT",
      person: deps.mapEmployeeToMobilePerson(latestEmployee),
      status: 409,
    };
  }

  await deps.insertAuditLog(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action,
    resource_type: "employee",
    resource_id: input.employeeId,
    details: {
      fromStatus: currentEmployee.status,
      toStatus: updatedEmployee.status,
      note: input.body.note ?? "",
      changedFields: ["status"],
    },
    ip_address: input.requestIp,
    user_agent: input.userAgent,
  });

  return {
    kind: "updated",
    person: deps.mapEmployeeToMobilePerson(updatedEmployee),
    status: 200,
  };
}
