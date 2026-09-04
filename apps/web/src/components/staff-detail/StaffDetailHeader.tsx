"use client";

import type { ReactNode } from "react";
import type { Employee } from "@/types";
import { PersonProfileHeader } from "@/components/staff/PersonProfileHeader";
import { getEmployeeDisplayName } from "@/lib/utils";
import { resolveAvatarSeed } from "@dubgrid/design-tokens";

interface StaffDetailHeaderProps {
  employee: Employee;
  actions?: ReactNode;
}

export function StaffDetailHeader({ employee, actions }: StaffDetailHeaderProps) {
  return (
    <PersonProfileHeader
      avatarSeed={resolveAvatarSeed(employee)}
      name={getEmployeeDisplayName(employee)}
      status={employee.status}
      email={employee.email}
      phone={employee.phone}
      employmentType={employee.employmentType}
      employeeNumber={employee.employeeNumber}
      actions={actions}
    />
  );
}
