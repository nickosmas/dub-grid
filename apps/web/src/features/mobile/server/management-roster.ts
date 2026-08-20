import { NextResponse, type NextRequest } from "next/server";
import type { MobileManagementUser } from "@dubgrid/contracts";
import {
  fetchMobileDepartmentRows,
  fetchMobileManagementRosterRows,
  type MobileInvitationRow,
  type MobileManagementRosterRows,
} from "@dubgrid/data-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireMobileAuth } from "@/features/mobile/server";

/**
 * The composite key the management roster is addressed by. A management user
 * may be an account with no staff profile, or an invitation with no account at
 * all, so neither a user id nor an employee id can identify every row on its
 * own. Mirrors the `get_org_directory` RPC's own `person_id` convention.
 */
export type ManagementUserRef =
  { kind: "member"; userId: string } | { kind: "invitation"; invitationId: string };

export function parseManagementUserId(personId: string): ManagementUserRef | null {
  const [prefix, ...rest] = personId.split(":");
  const value = rest.join(":");
  if (!value) return null;
  if (prefix === "u") return { kind: "member", userId: value };
  if (prefix === "inv") return { kind: "invitation", invitationId: value };
  return null;
}

function toMobileOrgRole(value: string | null | undefined): MobileManagementUser["orgRole"] {
  return value === "super_admin" || value === "admin" || value === "user" ? value : null;
}

function toEmployeeStatus(
  value: string | null | undefined,
): MobileManagementUser["employeeStatus"] {
  return value === "active" || value === "inactive" || value === "removed" ? value : null;
}

function invitationToManagementUser(row: MobileInvitationRow): MobileManagementUser {
  return {
    id: `inv:${row.id}`,
    source: "pending_invite",
    userId: null,
    employeeId: row.employee_id ?? null,
    employeeStatus: null,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    email: row.email,
    phone: row.phone ?? "",
    orgRole: toMobileOrgRole(row.role_to_assign),
    managementDepartmentIds: row.department_ids ?? [],
    managementDeptAdminIds: row.dept_admin_ids ?? [],
    updatedAt: row.updated_at ?? null,
    invitationId: row.id,
    invitationExpiresAt: row.expires_at,
  };
}

export function toManagementUsers(rows: MobileManagementRosterRows): MobileManagementUser[] {
  const members: MobileManagementUser[] = rows.memberships.map((row) => ({
    id: `u:${row.user_id}`,
    source: "member",
    userId: row.user_id,
    employeeId: row.employee_id,
    employeeStatus: toEmployeeStatus(row.employee_status),
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    orgRole: toMobileOrgRole(row.org_role),
    managementDepartmentIds: row.department_ids ?? [],
    managementDeptAdminIds: row.dept_admin_ids ?? [],
    updatedAt: row.updated_at ?? null,
    invitationId: null,
    invitationExpiresAt: null,
  }));

  return [...members, ...rows.invitations.map(invitationToManagementUser)].sort((left, right) =>
    `${left.firstName} ${left.lastName}`
      .trim()
      .localeCompare(`${right.firstName} ${right.lastName}`.trim()),
  );
}

export async function loadManagementUsers(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileManagementUser[]> {
  return toManagementUsers(await fetchMobileManagementRosterRows(serviceClient, orgId));
}

export async function findManagementUser(
  serviceClient: SupabaseClient,
  orgId: string,
  personId: string,
): Promise<MobileManagementUser | null> {
  const ref = parseManagementUserId(personId);
  if (!ref) return null;
  const all = await loadManagementUsers(serviceClient, orgId);
  return (
    all.find((candidate) =>
      ref.kind === "member"
        ? candidate.userId === ref.userId
        : candidate.invitationId === ref.invitationId,
    ) ?? null
  );
}

/**
 * Departments must exist in this org and be management departments — the same
 * check the per-person management-access route makes, for the same reason.
 */
export async function findInvalidManagementDepartmentIds(
  serviceClient: SupabaseClient,
  orgId: string,
  departmentIds: number[],
): Promise<number[]> {
  const rows = await fetchMobileDepartmentRows(serviceClient, orgId);
  const managementIds = new Set(
    rows.filter((row) => row.type === "management").map((row) => row.id),
  );
  return departmentIds.filter((id) => !managementIds.has(id));
}

export function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers?.get("x-forwarded-for") ?? null;
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

export function managementConflictResponse() {
  return NextResponse.json(
    {
      error: "Management access changed elsewhere. Refresh and try again.",
      code: "ORG_ACCESS_CONFLICT",
    },
    { status: 409 },
  );
}

/**
 * Everything on the roster is super_admin-or-gridmaster territory, same as the
 * per-person route. `viewOnly` widens the gate to anyone who may manage staff,
 * so the list can be read by managers who can't edit it.
 */
export async function requireManagementRosterActor(
  req: NextRequest,
  options: { viewOnly?: boolean } = {},
) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth;

  const allowed = options.viewOnly
    ? auth.permissions.canManageUsers || auth.permissions.canManageEmployees
    : auth.permissions.canManageUsers;

  if (!allowed) {
    return {
      response: NextResponse.json(
        { error: "You don't have permission to manage management access." },
        { status: 403 },
      ),
    };
  }

  return { auth };
}
