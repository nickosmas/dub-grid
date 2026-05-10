export type EmployeeStatus = "active" | "benched" | "terminated";
export type EmployeeEmploymentType = "full_time" | "part_time";

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employmentType: EmployeeEmploymentType;
  status: EmployeeStatus;
  statusChangedAt: string | null;
  statusNote: string;
  certificationId: number | null;
  roleIds: number[];
  seniority: number;
  focusAreaIds: number[];
  phone: string;
  email: string;
  contactNotes: string;
  archivedAt?: string | null;
  userId: string | null;
  departmentIds: number[];
  deptAdminIds: number[];
  version: number;
}
