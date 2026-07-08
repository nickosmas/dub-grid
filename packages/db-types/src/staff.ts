import type { EmployeeEmploymentType, EmployeeStatus } from "@dubgrid/domain";

export interface DbEmployee {
  id: string;
  org_id: string;
  employee_number: number;
  first_name: string;
  last_name: string;
  employment_type: EmployeeEmploymentType;
  status: EmployeeStatus;
  status_changed_at: string | null;
  status_note: string;
  certification_id: number | null;
  role_ids: number[];
  seniority: number;
  focus_area_ids: number[];
  phone: string;
  email: string;
  contact_notes: string;
  archived_at: string | null;
  user_id: string | null;
  department_ids: number[];
  dept_admin_ids: number[];
  version: number;
  created_at: string | null;
}
