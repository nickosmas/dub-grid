import type { AdminPermissions, Invitation, OrganizationUser } from "@/types";
import { PERMISSION_LABELS } from "@/lib/permission-labels";
import type { ReviewChange } from "@/components/review/ChangeReviewModal";

export interface AccessReviewChange extends ReviewChange {
  previousValue: unknown;
  nextValue: unknown;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "User",
};

const EMPTY_VALUE = "Not set";

function normalizePermissions(
  permissions: AdminPermissions | null | undefined,
): Record<string, boolean> {
  if (!permissions) return {};

  return Object.fromEntries(
    Object.entries(permissions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, !!value]),
  );
}

function permissionsEqual(
  left: AdminPermissions | null | undefined,
  right: AdminPermissions | null | undefined,
): boolean {
  return JSON.stringify(normalizePermissions(left)) === JSON.stringify(normalizePermissions(right));
}

function formatRole(role: string | null | undefined): string {
  return role ? (ROLE_LABELS[role] ?? role) : EMPTY_VALUE;
}

function formatName(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : EMPTY_VALUE;
}

function formatIdList(ids: number[] | undefined): string {
  if (!ids || ids.length === 0) return "None";
  return [...ids].sort((left, right) => left - right).join(", ");
}

export function formatAdminPermissionsSummary(
  permissions: AdminPermissions | null | undefined,
): string {
  const normalized = normalizePermissions(permissions);
  const granted = Object.keys(normalized)
    .filter((key) => normalized[key])
    .map((key) => PERMISSION_LABELS[key as keyof AdminPermissions] ?? key);

  if (granted.length === 0) return "No extra permissions";
  if (granted.length <= 3) return granted.join(", ");
  return `${granted.length} permissions enabled`;
}

/** The permission half of a membership review, for editors that only touch permissions. */
export function buildAdminPermissionChanges(
  previous: AdminPermissions | null | undefined,
  next: AdminPermissions | null | undefined,
): AccessReviewChange[] {
  if (permissionsEqual(previous, next)) return [];
  return [
    {
      key: "adminPermissions",
      label: "Admin Permissions",
      previousValue: previous ?? null,
      nextValue: next ?? null,
      previousDisplay: formatAdminPermissionsSummary(previous),
      nextDisplay: formatAdminPermissionsSummary(next),
      sensitive: true,
    },
  ];
}

export function buildMembershipAccessChanges(
  previous: OrganizationUser,
  next: Pick<OrganizationUser, "orgRole" | "adminPermissions">,
): AccessReviewChange[] {
  const changes: AccessReviewChange[] = [];

  if (previous.orgRole !== next.orgRole) {
    changes.push({
      key: "orgRole",
      label: "Organization Role",
      previousValue: previous.orgRole,
      nextValue: next.orgRole,
      previousDisplay: formatRole(previous.orgRole),
      nextDisplay: formatRole(next.orgRole),
      sensitive: true,
    });
  }

  changes.push(...buildAdminPermissionChanges(previous.adminPermissions, next.adminPermissions));

  return changes;
}

export function buildMembershipRemovalChanges(user: OrganizationUser): AccessReviewChange[] {
  return [
    {
      key: "organizationAccess",
      label: "Organization Access",
      previousValue: "active",
      nextValue: "removed",
      previousDisplay: `${formatRole(user.orgRole)} access`,
      nextDisplay: "Removed",
      sensitive: true,
    },
  ];
}

export function buildInvitationChanges(
  previous: Invitation,
  next: Partial<Invitation>,
): AccessReviewChange[] {
  const nextInvitation: Invitation = {
    ...previous,
    ...next,
    departmentIds: next.departmentIds ?? previous.departmentIds ?? [],
    deptAdminIds: next.deptAdminIds ?? previous.deptAdminIds ?? [],
  };

  const changes: AccessReviewChange[] = [];

  if (previous.email !== nextInvitation.email) {
    changes.push({
      key: "email",
      label: "Email",
      previousValue: previous.email,
      nextValue: nextInvitation.email,
      previousDisplay: formatName(previous.email),
      nextDisplay: formatName(nextInvitation.email),
      sensitive: true,
    });
  }

  if (previous.roleToAssign !== nextInvitation.roleToAssign) {
    changes.push({
      key: "roleToAssign",
      label: "Invitation Role",
      previousValue: previous.roleToAssign,
      nextValue: nextInvitation.roleToAssign,
      previousDisplay: formatRole(previous.roleToAssign),
      nextDisplay: formatRole(nextInvitation.roleToAssign),
      sensitive: true,
    });
  }

  const textFields: Array<{
    key: "firstName" | "lastName" | "phone";
    label: string;
  }> = [
    { key: "firstName", label: "First Name" },
    { key: "lastName", label: "Last Name" },
    { key: "phone", label: "Phone" },
  ];

  for (const field of textFields) {
    const key = field.key;

    if ((previous[key] ?? null) !== (nextInvitation[key] ?? null)) {
      changes.push({
        key,
        label: field.label,
        previousValue: previous[key] ?? null,
        nextValue: nextInvitation[key] ?? null,
        previousDisplay: formatName(previous[key] ?? null),
        nextDisplay: formatName(nextInvitation[key] ?? null),
        sensitive: false,
      });
    }
  }

  if (formatIdList(previous.departmentIds) !== formatIdList(nextInvitation.departmentIds)) {
    changes.push({
      key: "departmentIds",
      label: "Management Departments",
      previousValue: previous.departmentIds ?? [],
      nextValue: nextInvitation.departmentIds ?? [],
      previousDisplay: formatIdList(previous.departmentIds),
      nextDisplay: formatIdList(nextInvitation.departmentIds),
      sensitive: true,
    });
  }

  if (formatIdList(previous.deptAdminIds) !== formatIdList(nextInvitation.deptAdminIds)) {
    changes.push({
      key: "deptAdminIds",
      label: "Department Admin Assignments",
      previousValue: previous.deptAdminIds ?? [],
      nextValue: nextInvitation.deptAdminIds ?? [],
      previousDisplay: formatIdList(previous.deptAdminIds),
      nextDisplay: formatIdList(nextInvitation.deptAdminIds),
      sensitive: true,
    });
  }

  return changes;
}

export function buildInvitationRevocationChanges(): AccessReviewChange[] {
  return [
    {
      key: "invitationStatus",
      label: "Invitation Status",
      previousValue: "pending",
      nextValue: "revoked",
      previousDisplay: "Pending",
      nextDisplay: "Revoked",
      sensitive: true,
    },
  ];
}
