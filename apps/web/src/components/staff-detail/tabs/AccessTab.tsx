"use client";

import { KeyRound, Network } from "lucide-react";
import { Button } from "@/components/Button";
import { MemberAccessControls } from "@/components/staff/MemberAccessControls";
import type {
  AdminPermissions,
  DirectoryPerson,
  Employee,
  Invitation,
  NamedItem,
  OrganizationRole,
} from "@/types";
import { InfoField } from "../PersonInfoCards";

const ROLE_NAMES: Record<OrganizationRole, string> = {
  user: "User",
  admin: "Admin",
  super_admin: "Super Admin",
};

interface AccessTabProps {
  employee: Employee;
  /** The membership's role, or the one a pending invitation will grant. */
  orgRole: OrganizationRole | null;
  directoryPerson: DirectoryPerson | null;
  pendingInvitation: Invitation | null;
  hasPendingManagementInvite: boolean;
  departments: NamedItem[];
  canManageManagementAccess: boolean;
  canManageEmployees: boolean;
  isSelf: boolean;
  labels: { focusAreaLabel?: string; certificationLabel?: string; roleLabel?: string };
  onRoleChange: (role: OrganizationRole, accessToken?: string) => Promise<void>;
  onPermissionsChange: (perms: AdminPermissions, accessToken?: string) => Promise<void>;
  onEditManagementAccess: () => void;
  /** Present when this viewer can invite them now. */
  onInvite?: () => void;
}

/** Their role, the permissions it carries and the departments they manage. */
export function AccessTab({
  employee,
  orgRole,
  directoryPerson,
  pendingInvitation,
  hasPendingManagementInvite,
  departments,
  canManageManagementAccess,
  canManageEmployees,
  isSelf,
  labels,
  onRoleChange,
  onPermissionsChange,
  onEditManagementAccess,
  onInvite,
}: AccessTabProps) {
  const hasAccessRecord = Boolean(orgRole || employee.userId || pendingInvitation);
  const showsManagement =
    (canManageManagementAccess || canManageEmployees) &&
    Boolean(directoryPerson?.isManagementUser || hasPendingManagementInvite);
  const managedDepartments = (directoryPerson?.managementDepartmentIds ?? [])
    .map((id) => departments.find((department) => department.id === id)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col gap-4">
      {hasAccessRecord ? (
        <section className="dg-card">
          <div className="dg-card-header">
            <div>
              <div className="dg-card-title flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[var(--dg-color-text-muted)]" aria-hidden />
                Access
              </div>
              <div className="dg-card-subtitle">
                Organization role and the permissions it carries.
              </div>
            </div>
          </div>
          {canManageManagementAccess && orgRole ? (
            <div className="dg-card-body flex flex-col gap-6">
              <MemberAccessControls
                orgRole={orgRole}
                adminPermissions={directoryPerson?.adminPermissions}
                onRoleChange={onRoleChange}
                onPermissionsChange={directoryPerson?.userId ? onPermissionsChange : undefined}
                isSelf={isSelf}
                labels={labels}
                pendingInvitationEmail={pendingInvitation?.email}
              />
            </div>
          ) : (
            <dl className="dg-card-body grid gap-4 sm:grid-cols-2">
              <InfoField label="Role">{orgRole ? ROLE_NAMES[orgRole] : "No app access"}</InfoField>
            </dl>
          )}
        </section>
      ) : (
        <section className="dg-card">
          <div className="dg-card-body flex flex-col items-center gap-1 py-8 text-center">
            <div className="text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
              No app access
            </div>
            <p className="m-0 max-w-[360px] text-[13px] text-[var(--dg-color-text-muted)]">
              {employee.email
                ? "They can't sign in until they accept an invitation."
                : "They can't sign in. Add an email in Contact to invite them."}
            </p>
            {onInvite ? (
              <Button type="button" className="dg-btn dg-btn-secondary mt-3" onClick={onInvite}>
                Send invitation
              </Button>
            ) : null}
          </div>
        </section>
      )}

      {showsManagement && (
        <section className="dg-card">
          <div className="dg-card-header">
            <div className="dg-card-title flex items-center gap-2">
              <Network className="h-4 w-4 text-[var(--dg-color-text-muted)]" aria-hidden />
              Management departments
            </div>
            {canManageManagementAccess && employee.status !== "removed" ? (
              <Button
                type="button"
                className="dg-btn dg-btn-secondary dg-btn-sm"
                onClick={onEditManagementAccess}
              >
                Edit access
              </Button>
            ) : null}
          </div>
          <dl className="dg-card-body grid gap-4 sm:grid-cols-2">
            <InfoField label="Departments">{managedDepartments || "-"}</InfoField>
          </dl>
        </section>
      )}
    </div>
  );
}
