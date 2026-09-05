"use client";

import type { ReactNode } from "react";
import type { Employee, OrganizationRole } from "@/types";
import { PersonProfileHeader } from "@/components/staff/PersonProfileHeader";
import { getEmployeeDisplayName } from "@/lib/utils";
import { resolveAvatarSeed } from "@dubgrid/design-tokens";

interface StaffDetailHeaderProps {
  employee: Employee;
  /** The tier the page's Access card shows, live membership or pending invite. */
  orgRole?: OrganizationRole | null;
  actions?: ReactNode;
}

export function StaffDetailHeader({ employee, orgRole, actions }: StaffDetailHeaderProps) {
  return (
    <PersonProfileHeader
      avatarSeed={resolveAvatarSeed(employee)}
      name={getEmployeeDisplayName(employee)}
      orgRole={orgRole}
      email={employee.email}
      phone={employee.phone}
      employmentType={employee.employmentType}
      employeeNumber={employee.employeeNumber}
      actions={actions}
    />
  );
}
