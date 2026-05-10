import type { AssignableOrganizationRole } from "@/types";

export interface FocusAreaRow {
  id: string;
  name: string;
  departmentId: string | null;
}

export interface NamedItemRow {
  id: string;
  name: string;
  abbr: string;
}

export interface DeptRow {
  id: string;
  name: string;
  abbr: string;
  type: "scheduled" | "management";
}

export interface ShiftCatRow {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  focusAreaId: string | null;
}

export interface JobRow {
  id: string;
  label: string;
  name: string;
  color: string;
  departmentIds: string[];
  focusAreaIds: string[];
  shiftCategoryIds: string[];
}

export interface EmployeeRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface CreatedEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface InvitationRow {
  employeeId: string;
  name: string;
  email: string;
  selected: boolean;
  role: AssignableOrganizationRole;
}

export interface PendingInvite {
  token: string;
  email: string;
  name: string;
}
