export type EmployeeStatus = "active" | "inactive" | "removed";
export type EmployeeEmploymentType = "full_time" | "part_time";

export interface Employee {
  id: string;
  /** Auto-assigned by DB trigger on insert. Optional on input shapes (test fixtures, pre-insert builders) where the value isn't known yet. */
  employeeNumber?: number;
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
  /** When the employee row was created. Surfaced as "Date Joined" in the People table. Optional on input shapes where the value isn't known yet. */
  createdAt?: string | null;
}
