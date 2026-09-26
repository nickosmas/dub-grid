"use client";

import type { ReactNode } from "react";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import { Button } from "@/components/Button";
import type {
  GridmasterPersonOrganization,
  GridmasterPersonRecord,
  GridmasterStaffRecord,
} from "@/features/gridmaster/person-record";
import { formatOrganizationRoleLabel } from "@/lib/client-facing";
import { permissionLabel } from "@/lib/permission-labels";
import type { Invitation } from "@/types";
import { PersonField, PersonFieldGrid, PersonSection, PersonSubheading } from "./PersonField";
import { formatActor, formatDay, formatMoment } from "./person-format";

const STAFF_STATUS: Record<GridmasterStaffRecord["status"], string> = {
  active: "Active",
  inactive: "Inactive",
  removed: "Removed",
};

function namesOf(ids: number[], names: Record<number, string>): string {
  return ids.map((id) => names[id] ?? `#${id}`).join(", ");
}

function stamp(record: GridmasterPersonRecord, at: string | null, by: string | null) {
  if (!at) return null;
  const actor = formatActor(record, by);
  return actor ? `${formatDay(at)} by ${actor}` : formatDay(at);
}

function invitationState(
  invitation: Invitation,
  nowMs: number,
): {
  label: string;
  tone: StatusPillTone;
} {
  if (invitation.acceptedAt) return { label: "Accepted", tone: "success" };
  if (invitation.revokedAt) return { label: "Revoked", tone: "neutral" };
  if (Date.parse(invitation.expiresAt) <= nowMs) return { label: "Expired", tone: "warning" };
  return { label: "Pending", tone: "info" };
}

function MembershipFacts({
  organization,
  record,
}: {
  organization: GridmasterPersonOrganization;
  record: GridmasterPersonRecord;
}) {
  const { membership, names, terminology } = organization;
  if (!membership) {
    return (
      <p className="text-[13px] text-[var(--dg-color-text-muted)]">
        No membership. They cannot sign in to this organization.
      </p>
    );
  }
  const granted = Object.entries(membership.adminPermissions ?? {})
    .filter(([, allowed]) => allowed === true)
    .map(([key]) => permissionLabel(key));
  const tours = Object.entries(membership.tooltipToursCompleted)
    .filter(([, done]) => Boolean(done))
    .map(([tour]) => tour);

  return (
    <PersonFieldGrid>
      <PersonField label="Role" value={formatOrganizationRoleLabel(membership.orgRole)} />
      <PersonField label="Joined" value={formatDay(membership.joinedAt)} tabular />
      <PersonField
        label="Permissions"
        value={granted.length > 0 ? granted.join(", ") : null}
        empty={membership.orgRole === "admin" ? "None granted" : "Not applicable"}
        wide
      />
      <PersonField
        label={terminology.departmentLabel}
        value={namesOf(membership.departmentIds, names.departments)}
        empty="None"
      />
      <PersonField
        label="Management departments"
        value={namesOf(membership.deptAdminIds, names.departments)}
        empty="None"
      />
      <PersonField
        label="Onboarding"
        value={
          membership.onboardingCompletedAt
            ? `Completed ${formatDay(membership.onboardingCompletedAt)}`
            : null
        }
        empty="Not completed"
      />
      <PersonField label="Tours completed" value={tours.join(", ")} empty="None" />
      <PersonField
        label="Schedule last viewed"
        value={
          membership.scheduleLastViewedAt ? formatMoment(membership.scheduleLastViewedAt) : null
        }
        empty="Never"
        tabular
      />
      <PersonField label="Membership phone" value={membership.phone} />
      <PersonField
        label="Archived"
        value={stamp(record, membership.archivedAt, membership.archivedBy)}
        empty="No"
      />
      <PersonField label="Membership updated" value={formatDay(membership.updatedAt)} tabular />
    </PersonFieldGrid>
  );
}

function StaffFacts({
  employee,
  organization,
  record,
}: {
  employee: GridmasterStaffRecord;
  organization: GridmasterPersonOrganization;
  record: GridmasterPersonRecord;
}) {
  const { names, terminology } = organization;
  return (
    <PersonFieldGrid>
      <PersonField label="Name" value={`${employee.firstName} ${employee.lastName}`.trim()} />
      <PersonField label="Employee number" value={String(employee.employeeNumber)} tabular />
      <PersonField
        label="Status"
        value={
          employee.statusChangedAt
            ? `${STAFF_STATUS[employee.status]} since ${formatDay(employee.statusChangedAt)}`
            : STAFF_STATUS[employee.status]
        }
      />
      <PersonField
        label="Employment"
        value={employee.employmentType === "part_time" ? "Part-time" : "Full-time"}
      />
      {employee.statusNote ? (
        <PersonField label="Status note" value={employee.statusNote} wide />
      ) : null}
      <PersonField label="Email" value={employee.email} />
      <PersonField label="Phone" value={employee.phone} />
      <PersonField
        label={terminology.departmentLabel}
        value={namesOf(employee.departmentIds, names.departments)}
        empty="None"
      />
      <PersonField
        label={terminology.focusAreaLabel}
        value={namesOf(employee.focusAreaIds, names.focusAreas)}
        empty="None"
      />
      <PersonField
        label={terminology.roleLabel}
        value={namesOf(employee.roleIds, names.roles)}
        empty="None"
      />
      <PersonField
        label={terminology.certificationLabel}
        value={
          employee.certificationId !== null
            ? namesOf([employee.certificationId], names.certifications)
            : null
        }
        empty="None"
      />
      <PersonField label="Seniority" value={String(employee.seniority)} tabular />
      <PersonField
        label="Management departments"
        value={namesOf(employee.deptAdminIds, names.departments)}
        empty="None"
      />
      {employee.contactNotes ? (
        <PersonField label="Contact notes" value={employee.contactNotes} wide />
      ) : null}
      <PersonField
        label="Added"
        value={stamp(record, employee.createdAt ?? null, employee.createdBy)}
      />
      <PersonField
        label="Last updated"
        value={stamp(record, employee.updatedAt, employee.updatedBy)}
      />
      <PersonField
        label="Archived"
        value={employee.archivedAt ? formatDay(employee.archivedAt) : null}
        empty="No"
      />
    </PersonFieldGrid>
  );
}

function InvitationHistory({
  invitations,
  record,
  renderActions,
}: {
  invitations: Invitation[];
  record: GridmasterPersonRecord;
  renderActions?: (invitation: Invitation) => ReactNode;
}) {
  if (invitations.length === 0) {
    return <p className="text-[13px] text-[var(--dg-color-text-muted)]">No invitations sent.</p>;
  }
  const nowMs = Date.now();
  return (
    <ul className="flex flex-col divide-y divide-[var(--dg-color-border-light)]">
      {invitations.map((invitation) => {
        const state = invitationState(invitation, nowMs);
        return (
          <li key={invitation.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={state.tone}>{state.label}</StatusPill>
              <span className="text-[13px] text-[var(--dg-color-text-primary)]">
                {invitation.email} as {formatOrganizationRoleLabel(invitation.roleToAssign)}
              </span>
            </div>
            <div className="dg-tabular-nums text-[12px] text-[var(--dg-color-text-muted)]">
              Sent {stamp(record, invitation.createdAt, invitation.invitedBy)}
              {" · "}
              {invitation.acceptedAt
                ? `Accepted ${formatMoment(invitation.acceptedAt)}`
                : invitation.revokedAt
                  ? `Revoked ${formatMoment(invitation.revokedAt)}`
                  : `Expires ${formatMoment(invitation.expiresAt)}`}
            </div>
            {renderActions ? (
              <div className="flex flex-wrap gap-2">{renderActions(invitation)}</div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Everything about the person in one organization. */
export function PersonOrganizationCard({
  organization,
  record,
  onOpenOrganization,
  membershipActions,
  renderStaffActions,
  renderInvitationActions,
}: {
  organization: GridmasterPersonOrganization;
  record: GridmasterPersonRecord;
  onOpenOrganization: (orgId: string) => void;
  membershipActions?: ReactNode;
  renderStaffActions?: (employee: GridmasterStaffRecord) => ReactNode;
  renderInvitationActions?: (invitation: Invitation) => ReactNode;
}) {
  const { org, employees, invitations } = organization;
  return (
    <PersonSection
      title={org.name}
      description={org.slug ? `${org.slug}.dubgrid.com` : undefined}
      actions={
        <Button className="dg-btn dg-btn-secondary" onClick={() => onOpenOrganization(org.id)}>
          Open organization employees
        </Button>
      }
    >
      <PersonSubheading>Membership</PersonSubheading>
      <MembershipFacts organization={organization} record={record} />
      {membershipActions ? <div className="flex flex-wrap gap-2">{membershipActions}</div> : null}

      <PersonSubheading>Staff record</PersonSubheading>
      {employees.length === 0 ? (
        <p className="text-[13px] text-[var(--dg-color-text-muted)]">No staff record.</p>
      ) : (
        employees.map((employee) => (
          <div key={employee.id} className="flex flex-col gap-3">
            <StaffFacts employee={employee} organization={organization} record={record} />
            {renderStaffActions ? (
              <div className="flex flex-wrap gap-2">{renderStaffActions(employee)}</div>
            ) : null}
          </div>
        ))
      )}

      <PersonSubheading>Invitations</PersonSubheading>
      <InvitationHistory
        invitations={invitations}
        record={record}
        renderActions={renderInvitationActions}
      />
    </PersonSection>
  );
}
