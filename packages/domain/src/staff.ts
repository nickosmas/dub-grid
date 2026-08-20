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

export interface StaffCredentialSummary {
  /** Holds a certification. In a care or medical facility these are the nurses. */
  certified: number;
  /** Holds none. Support staff carry no certification, by convention. */
  uncertified: number;
}

/** Headcounts describe who is on staff now, so inactive and removed rows never count. */
type CountableStaff = Pick<Employee, "certificationId" | "status">;

const isActive = (employee: CountableStaff) => employee.status === "active";

/**
 * Split the active roster into certified and uncertified staff.
 *
 * Holding a certification is the whole signal: certifications are issued to
 * certified staff, and support staff are given none — not a catch-all like
 * "Other", which is exactly what used to let them be counted as certified.
 *
 * Filtering to active here rather than trusting the caller keeps every surface
 * honest; an inactive nurse is not someone you can schedule.
 */
export function summarizeStaffByCredential(
  employees: readonly CountableStaff[],
): StaffCredentialSummary {
  let certified = 0;
  let uncertified = 0;
  for (const employee of employees) {
    if (!isActive(employee)) continue;
    if (employee.certificationId != null) certified += 1;
    else uncertified += 1;
  }
  return { certified, uncertified };
}

export interface StaffCertificationCount {
  /** A certification id, or the bucket for references that no longer resolve. */
  certificationId: number | "archived";
  count: number;
}

/**
 * How many active staff hold each certification.
 *
 * Returns one entry per certification in the order given, zero counts included:
 * an org seeing 0 against a credential is being told nobody holds it, which is
 * a staffing gap worth surfacing rather than hiding.
 *
 * The certification list arrives filtered to unarchived rows, so a holder of an
 * archived one resolves to nothing. Those land in a trailing "archived" entry,
 * emitted only when non-empty, so the counts always sum to `certified` from
 * `summarizeStaffByCredential`. This is a display bucket for dangling
 * references, never a catch-all certification to assign anyone to.
 */
export function countStaffByCertification(
  employees: readonly CountableStaff[],
  certifications: readonly { id: number }[],
): StaffCertificationCount[] {
  const counts = new Map<number | "archived", number>(
    certifications.map((certification) => [certification.id, 0]),
  );
  for (const employee of employees) {
    if (!isActive(employee) || employee.certificationId == null) continue;
    const key = counts.has(employee.certificationId) ? employee.certificationId : "archived";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: StaffCertificationCount[] = certifications.map((certification) => ({
    certificationId: certification.id,
    count: counts.get(certification.id) ?? 0,
  }));
  const archived = counts.get("archived") ?? 0;
  if (archived > 0) {
    result.push({ certificationId: "archived", count: archived });
  }
  return result;
}
