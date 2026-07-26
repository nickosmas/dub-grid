import type { MobilePerson, MobilePersonStatusUpdateBody } from "@dubgrid/contracts";
import type { Employee } from "@dubgrid/domain";
import {
  isSelfAction,
  SELF_ACTION_FORBIDDEN_CODE,
  SELF_ACTION_FORBIDDEN_MESSAGE,
} from "@dubgrid/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MobileApiAuthorizationError } from "./read";

type PeopleStatusContext = {
  currentOrg: {
    id: string;
  };
  permissions: {
    canManageEmployees: boolean;
    // Gates syncing organization_memberships alongside employees.status —
    // mirrors the tier DELETE /api/organizations/access requires on web, so
    // a plain admin with only canManageEmployees can't use remove/activate as
    // a side door to change org access they aren't allowed to touch directly.
    // Gridmaster mobile access is blocked entirely at auth resolution, so
    // super_admin is the only tier that needs checking here.
    isSuperAdmin: boolean;
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

type FetchActiveMembershipOrgRole = (
  serviceClient: SupabaseClient,
  orgId: string,
  userId: string,
) => Promise<string | null>;

type CountActiveSuperAdmins = (serviceClient: SupabaseClient, orgId: string) => Promise<number>;

type ArchiveOrganizationMembership = (
  serviceClient: SupabaseClient,
  input: { orgId: string; userId: string; archivedByUserId: string; archivedAt: string },
) => Promise<void>;

type RestoreOrganizationMembership = (
  serviceClient: SupabaseClient,
  input: { orgId: string; userId: string },
) => Promise<void>;

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
      kind: "self_action_forbidden";
      error: string;
      code: typeof SELF_ACTION_FORBIDDEN_CODE;
      status: 403;
    }
  | {
      kind: "cannot_remove_last_super_admin";
      error: string;
      status: 400;
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
    fetchActiveMembershipOrgRole: FetchActiveMembershipOrgRole;
    countActiveSuperAdmins: CountActiveSuperAdmins;
    archiveOrganizationMembership: ArchiveOrganizationMembership;
    restoreOrganizationMembership: RestoreOrganizationMembership;
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

  // Self-action guard: you can't change your own staffing status
  // (deactivate / remove / activate). Another admin must act.
  if (isSelfAction(auth.user.id, currentEmployee.userId)) {
    return {
      kind: "self_action_forbidden",
      error: SELF_ACTION_FORBIDDEN_MESSAGE,
      code: SELF_ACTION_FORBIDDEN_CODE,
      status: 403,
    };
  }

  if (currentEmployee.version !== input.body.expectedVersion) {
    return {
      kind: "conflict",
      error: "Employee status changed elsewhere. Review the latest values before saving again.",
      code: "EMPLOYEE_STATUS_CONFLICT",
      person: deps.mapEmployeeToMobilePerson(currentEmployee),
      status: 409,
    };
  }

  // Removing staff already fully blocks login at the JWT hook regardless of
  // org_role, so removing the org's only super_admin here would lock the org
  // out just as surely as deleting their membership would — same guard as
  // DELETE /api/organizations/access on web.
  if (input.body.action === "remove" && currentEmployee.userId) {
    const targetOrgRole = await deps.fetchActiveMembershipOrgRole(
      auth.serviceClient,
      auth.currentOrg.id,
      currentEmployee.userId,
    );

    if (targetOrgRole === "super_admin") {
      const superAdminCount = await deps.countActiveSuperAdmins(
        auth.serviceClient,
        auth.currentOrg.id,
      );

      if (superAdminCount <= 1) {
        return {
          kind: "cannot_remove_last_super_admin",
          error: "Cannot remove the only super admin. Transfer ownership first.",
          status: 400,
        };
      }
    }
  }

  const now = new Date().toISOString();
  const nextStatus =
    input.body.action === "deactivate"
      ? "inactive"
      : input.body.action === "remove"
        ? "removed"
        : "active";
  const nextStatusNote = input.body.action === "deactivate" ? (input.body.note ?? "") : "";
  const action =
    input.body.action === "deactivate"
      ? "employee.deactivated"
      : input.body.action === "remove"
        ? "employee.removed"
        : "employee.activated";

  const updatedEmployee = await deps.updateEmployeeStatus(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    employeeId: input.employeeId,
    expectedVersion: input.body.expectedVersion,
    status: nextStatus,
    statusNote: nextStatusNote,
    statusChangedAt: now,
    archivedAt:
      input.body.action === "activate" ? null : input.body.action === "remove" ? now : undefined,
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
      error: "Employee status changed elsewhere. Review the latest values before saving again.",
      code: "EMPLOYEE_STATUS_CONFLICT",
      person: deps.mapEmployeeToMobilePerson(latestEmployee),
      status: 409,
    };
  }

  // Remove/activate a linked user's org membership in lockstep with their
  // employees.status, in the same request that already committed the status
  // change — not a second, separately-triggered call — so the two can't
  // diverge. Gated to super_admin (gridmaster mobile access is blocked
  // entirely at auth resolution) — the same tier DELETE
  // /api/organizations/access requires on web.
  if (
    (input.body.action === "remove" || input.body.action === "activate") &&
    currentEmployee.userId &&
    auth.permissions.isSuperAdmin
  ) {
    if (input.body.action === "remove") {
      await deps.archiveOrganizationMembership(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        userId: currentEmployee.userId,
        archivedByUserId: auth.user.id,
        archivedAt: now,
      });
    } else {
      await deps.restoreOrganizationMembership(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        userId: currentEmployee.userId,
      });
    }
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
