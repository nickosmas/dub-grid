import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchPublishedShiftRows,
  resolvePublishedScheduleEntry,
  type PublishedScheduleSegment,
  type PublishedShiftRow,
} from "@/lib/published-shifts";
import {
  buildOperationsReportMetrics,
  buildOperationsReportPreviewTable,
  formatReportDateForDisplay,
  formatReportCellForDisplay,
  type OperationsReportCell,
} from "@/features/reports/shared/table";

export const OPERATIONS_REPORT_TYPES = [
  "employee-directory",
  "staff-hours",
  "coverage",
  "shift-period-summary",
  "shift-requests",
  "absences-calloffs",
  "roster-status",
  "certification-role-matrix",
  "account-access",
  "schedule-matrix",
] as const;

export type OperationsReportType = (typeof OPERATIONS_REPORT_TYPES)[number];

export function isOperationsReportType(value: string): value is OperationsReportType {
  return OPERATIONS_REPORT_TYPES.includes(value as OperationsReportType);
}

const REPORTS_WITHOUT_DATE_HEADER = new Set<OperationsReportType>([
  "employee-directory",
  "roster-status",
  "certification-role-matrix",
  "account-access",
]);
const REPORT_PDF_STRIPED_ROW_GRAY = 0.945;

export interface OperationsReportRange {
  startDate: string;
  endDate: string;
}

export interface ReportMetric {
  label: string;
  value: string;
}

export interface StaffHoursReportRow {
  employeeId: string;
  employeeName: string;
  status: string;
  focusAreas: string;
  scheduledHours: number;
  shiftCount: number;
  workedDays: number;
  absenceCount: number;
  overtimeHours: number;
  overtime: boolean;
}

export interface EmployeeDirectoryReportRow {
  employeeId: string;
  employeeNumber: number | null;
  employeeName: string;
  status: string;
  employmentType: string;
  email: string;
  phone: string;
  focusAreas: string;
  roles: string;
  certification: string;
  departments: string;
}

export interface CoverageReportRow {
  date: string;
  focusArea: string;
  shift: string;
  job: string;
  required: number;
  scheduled: number;
  openSlots: number;
  coveragePct: number | null;
}

export interface ShiftPeriodSummaryReport {
  startDate: string;
  endDate: string;
  dayCount: number;
  activeStaffCount: number;
  scheduledStaffCount: number;
  totalScheduledHours: number;
  totalShifts: number;
  totalAbsences: number;
  overtimeAlertCount: number;
  openSlotCount: number;
  coveragePct: number | null;
  requestCount: number;
}

export interface ShiftRequestReportRow {
  id: string;
  type: string;
  status: string;
  requester: string;
  target: string;
  requesterShiftDate: string;
  targetShiftDate: string;
  createdAt: string;
  resolvedAt: string;
  resolutionHours: number | null;
}

export interface AbsenceCalloffReportRow {
  kind: "absence" | "calloff";
  employeeName: string;
  date: string;
  absenceType: string;
  status: string;
}

export interface RosterStatusReportRow {
  employeeId: string;
  employeeNumber: number | null;
  employeeName: string;
  status: string;
  employmentType: string;
  focusAreas: string;
  roles: string;
  certification: string;
  departments: string;
  linkedAccount: boolean;
  pendingInvitation: string;
}

export interface CertificationRoleMatrixReportRow {
  employeeId: string;
  employeeNumber: number | null;
  employeeName: string;
  status: string;
  certification: string;
  roles: string;
  focusAreas: string;
  departments: string;
  missingCertification: boolean;
  missingRole: boolean;
}

export interface AccountAccessReportRow {
  employeeId: string;
  employeeNumber: number | null;
  employeeName: string;
  status: string;
  email: string;
  linkedAccount: boolean;
  pendingInvitation: string;
  accountAccessStatus: string;
}

export interface ScheduleMatrixReportRow {
  employeeId: string;
  employeeName: string;
  cells: Record<string, string>;
}

export interface OperationsReportFilters {
  employeeIds?: string[];
  focusAreaIds?: number[];
  dates?: string[];
}

export interface OperationsReportFilterOption {
  id: string;
  label: string;
}

export interface OperationsReportEmployeeFilterOption extends OperationsReportFilterOption {
  status: string;
  focusAreaIds: number[];
}

export interface OperationsReportPayload {
  orgId: string;
  orgName: string;
  orgTimezone: string | null;
  generatedAt: string;
  range: OperationsReportRange;
  payPeriodStartDate: string | null;
  filters: {
    employeeIds: string[];
    focusAreaIds: number[];
    dates: string[];
  };
  filterOptions: {
    employees: OperationsReportEmployeeFilterOption[];
    focusAreas: OperationsReportFilterOption[];
    dates: string[];
  };
  reports: {
    employeeDirectory: EmployeeDirectoryReportRow[];
    staffHours: StaffHoursReportRow[];
    coverage: CoverageReportRow[];
    shiftPeriodSummary: ShiftPeriodSummaryReport;
    shiftRequests: ShiftRequestReportRow[];
    absencesCalloffs: AbsenceCalloffReportRow[];
    rosterStatus: RosterStatusReportRow[];
    certificationRoleMatrix: CertificationRoleMatrixReportRow[];
    accountAccess: AccountAccessReportRow[];
    scheduleMatrix: {
      dates: string[];
      rows: ScheduleMatrixReportRow[];
    };
  };
}

type NamedRow = {
  id: number;
  name?: string | null;
  label?: string | null;
  abbr?: string | null;
};

type FocusAreaRow = NamedRow & {
  department_id?: number | null;
};

type OrganizationRow = {
  id: string;
  name: string;
  timezone: string | null;
  pay_period_start_date: string | null;
};

type EmployeeReportRow = {
  id: string;
  employee_number: number | null;
  first_name: string | null;
  last_name: string | null;
  employment_type?: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  seniority: number | null;
  focus_area_ids: number[] | null;
  certification_id: number | null;
  role_ids: number[] | null;
  department_ids: number[] | null;
  user_id: string | null;
};

type CoverageRequirementRow = {
  id: number;
  focus_area_id: number;
  job_id: number | null;
  preferred_shift_id: number | null;
  day_of_week: number | null;
  min_staff: number;
};

type ShiftCategoryRow = {
  id: number;
  name: string;
  focus_area_id: number | null;
};

type ShiftRequestRow = {
  id: string;
  type: string;
  status: string;
  requester_emp_id: string;
  target_emp_id: string | null;
  requester_shift_date: string;
  target_shift_date: string | null;
  absence_type_id: number | null;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
};

type InvitationRow = {
  employee_id: string | null;
  email: string | null;
  expires_at: string;
};

type PublishedShiftReportRow = PublishedShiftRow & {
  focus_area_id?: number | null;
};

type ResolvedEntry = {
  entry: NonNullable<ReturnType<typeof resolvePublishedScheduleEntry>>;
  source: PublishedShiftReportRow;
};

export interface OperationsReportSourceData {
  org: OrganizationRow;
  /** Current roster only: active and inactive employees, never removed rows. */
  employees: EmployeeReportRow[];
  /** Removed employees retained solely to attribute historical records. */
  historicalEmployees: EmployeeReportRow[];
  focusAreas: FocusAreaRow[];
  roles: NamedRow[];
  certifications: NamedRow[];
  departments: NamedRow[];
  absenceTypes: NamedRow[];
  coverageRequirements: CoverageRequirementRow[];
  shiftCategories: ShiftCategoryRow[];
  jobs: NamedRow[];
  shiftRequests: ShiftRequestRow[];
  invitations: InvitationRow[];
  publishedRows: PublishedShiftReportRow[];
  generatedAt?: string;
}

const MS_PER_DAY = 86_400_000;

function parseIsoDateUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function countRangeDays(range: OperationsReportRange): number {
  return (
    Math.floor(
      (parseIsoDateUtc(range.endDate).getTime() - parseIsoDateUtc(range.startDate).getTime()) /
        MS_PER_DAY,
    ) + 1
  );
}

export function getDatesInReportRange(range: OperationsReportRange): string[] {
  const dayCount = countRangeDays(range);
  return Array.from({ length: Math.max(0, dayCount) }, (_, index) =>
    toIsoDate(addDays(parseIsoDateUtc(range.startDate), index)),
  );
}

export function resolveCurrentPayPeriodRange(
  anchorDate: string | null | undefined,
  today = new Date(),
): OperationsReportRange | null {
  if (!anchorDate) return null;
  const anchor = parseIsoDateUtc(anchorDate);
  if (Number.isNaN(anchor.getTime())) return null;

  const todayUtc = parseIsoDateUtc(toIsoDate(today));
  const diffDays = Math.floor((todayUtc.getTime() - anchor.getTime()) / MS_PER_DAY);
  const periodsSinceAnchor = Math.floor(diffDays / 14);
  const start = addDays(anchor, periodsSinceAnchor * 14);
  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(addDays(start, 13)),
  };
}

function formatName(row: { first_name?: string | null; last_name?: string | null }): string {
  const first = row.first_name?.trim() ?? "";
  const last = row.last_name?.trim() ?? "";
  return [first, last].filter(Boolean).join(" ") || "Unknown";
}

function formatList(
  ids: number[] | null | undefined,
  map: Map<number, string>,
  fallbackLabel: string,
): string {
  return (ids ?? [])
    .map((id) => map.get(id) ?? fallbackLabel)
    .filter(Boolean)
    .join("; ");
}

function resolveEmployeeDepartmentIds(
  employee: EmployeeReportRow,
  focusAreaDepartmentIdById: Map<number, number>,
): number[] {
  // department_ids can carry a department-admin permission grant unrelated to where an
  // employee actually works (e.g. a nurse also granted admin access to Administration),
  // so the scheduled department (where they're actually assigned to work) takes priority.
  // Fall back to department_ids only for management-only staff with no focus area at all.
  const scheduledDepartmentIds = new Set<number>();
  for (const focusAreaId of employee.focus_area_ids ?? []) {
    const departmentId = focusAreaDepartmentIdById.get(focusAreaId);
    if (departmentId != null) scheduledDepartmentIds.add(departmentId);
  }
  if (scheduledDepartmentIds.size > 0) {
    return Array.from(scheduledDepartmentIds);
  }
  return employee.department_ids ?? [];
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function percent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function getNamedValue(row: NamedRow): string {
  return row.name ?? row.label ?? row.abbr ?? "Unnamed item";
}

function buildMap(rows: NamedRow[]): Map<number, string> {
  return new Map(rows.map((row) => [row.id, getNamedValue(row)]));
}

function resolveEntries(
  rows: PublishedShiftReportRow[],
  absenceTypeById: Map<number, string>,
): ResolvedEntry[] {
  return rows
    .map((source) => {
      const entry = resolvePublishedScheduleEntry(source, new Map(), absenceTypeById);
      return entry ? { entry, source } : null;
    })
    .filter((item): item is ResolvedEntry => item != null);
}

function getEntryFocusAreaIds(
  item: ResolvedEntry,
  shiftById: Map<number, ShiftCategoryRow>,
): number[] {
  const ids = new Set<number>();
  if (item.source.focus_area_id != null) {
    ids.add(item.source.focus_area_id);
  }
  for (const segment of item.entry.segments ?? []) {
    if (segment.shiftId == null) continue;
    const focusAreaId = shiftById.get(segment.shiftId)?.focus_area_id;
    if (focusAreaId != null) ids.add(focusAreaId);
  }
  return [...ids];
}

function getSegmentFocusAreaId(
  segment: PublishedScheduleSegment,
  row: PublishedShiftReportRow,
  shiftById: Map<number, ShiftCategoryRow>,
): number | null {
  if (segment.shiftId != null) {
    return shiftById.get(segment.shiftId)?.focus_area_id ?? null;
  }
  return row.focus_area_id ?? null;
}

function segmentMatchesFocusAreas(
  segment: PublishedScheduleSegment,
  row: PublishedShiftReportRow,
  shiftById: Map<number, ShiftCategoryRow>,
  focusAreaIdSet: Set<number>,
): boolean {
  if (focusAreaIdSet.size === 0) return true;
  const focusAreaId = getSegmentFocusAreaId(segment, row, shiftById);
  return focusAreaId != null && focusAreaIdSet.has(focusAreaId);
}

function getSegmentDurationHours(segment: PublishedScheduleSegment): number {
  if (segment.durationHours != null) return segment.durationHours;
  if (!segment.startTime || !segment.endTime) return 0;
  const [startHour = 0, startMinute = 0] = segment.startTime.split(":").map(Number);
  const [endHour = 0, endMinute = 0] = segment.endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end <= start) end += 24 * 60;
  return Math.max(0, (end - start) / 60);
}

function getReportEntryDurationHours(
  item: ResolvedEntry,
  shiftById: Map<number, ShiftCategoryRow>,
  focusAreaIdSet: Set<number>,
): number {
  if (focusAreaIdSet.size === 0 || item.entry.kind !== "shift") {
    return item.entry.durationHours;
  }
  const segments = item.entry.segments ?? [];
  if (segments.length === 0) {
    return getEntryFocusAreaIds(item, shiftById).some((id) => focusAreaIdSet.has(id))
      ? item.entry.durationHours
      : 0;
  }
  return segments
    .filter((segment) => segmentMatchesFocusAreas(segment, item.source, shiftById, focusAreaIdSet))
    .reduce((sum, segment) => sum + getSegmentDurationHours(segment), 0);
}

function hasAnyNumber(values: number[] | null | undefined, selected: Set<number>): boolean {
  if (selected.size === 0) return true;
  return (values ?? []).some((value) => selected.has(value));
}

export function buildOperationsReportPayload(
  source: OperationsReportSourceData,
  range: OperationsReportRange,
  filters: OperationsReportFilters = {},
): OperationsReportPayload {
  const rangeDates = getDatesInReportRange(range);
  const rangeDateSet = new Set(rangeDates);
  const dates = Array.from(new Set(filters.dates ?? []))
    .filter((date) => rangeDateSet.has(date))
    .sort();
  const reportDates = dates.length > 0 ? dates : rangeDates;
  const reportDateSet = new Set(reportDates);
  const employeeIdSet = new Set(filters.employeeIds ?? []);
  const focusAreaIdSet = new Set(filters.focusAreaIds ?? []);
  const historicalEmployeeDirectory = [...source.employees, ...source.historicalEmployees];
  const employeeById = new Map(historicalEmployeeDirectory.map((row) => [row.id, row]));
  const employeeNameById = new Map(
    historicalEmployeeDirectory.map((row) => [row.id, formatName(row)]),
  );
  const focusAreaById = buildMap(source.focusAreas);
  const roleById = buildMap(source.roles);
  const certificationById = buildMap(source.certifications);
  const departmentById = buildMap(source.departments);
  const focusAreaDepartmentIdById = new Map(
    source.focusAreas
      .filter((row) => row.department_id != null)
      .map((row) => [row.id, row.department_id as number]),
  );
  const absenceTypeById = buildMap(source.absenceTypes);
  const jobById = buildMap(source.jobs);
  const shiftById = new Map(source.shiftCategories.map((row) => [row.id, row]));
  const shiftNameById = new Map(source.shiftCategories.map((row) => [row.id, row.name]));
  const currentReportEmployees = source.employees.filter((employee) => {
    if (employeeIdSet.size > 0 && !employeeIdSet.has(employee.id)) return false;
    return hasAnyNumber(employee.focus_area_ids, focusAreaIdSet);
  });
  const currentEmployeeIdSet = new Set(source.employees.map((employee) => employee.id));
  const historicalPublishedEntries = resolveEntries(source.publishedRows, absenceTypeById).filter(
    (item) => reportDateSet.has(item.entry.date),
  );
  // A removed employee appears only beside records in the requested historical
  // range. They remain excluded from current-roster lists and filter options.
  const removedEmployeesWithHistoricalEntries = source.historicalEmployees.filter((employee) => {
    if (currentEmployeeIdSet.has(employee.id) || employeeIdSet.size > 0) return false;
    if (!hasAnyNumber(employee.focus_area_ids, focusAreaIdSet)) return false;
    return historicalPublishedEntries.some((item) => item.entry.empId === employee.id);
  });
  const reportEmployees = [...currentReportEmployees, ...removedEmployeesWithHistoricalEntries];
  const reportEmployeeIdSet = new Set(reportEmployees.map((employee) => employee.id));
  const rosterEmployees = source.employees.filter((employee) => {
    if (employeeIdSet.size > 0 && !employeeIdSet.has(employee.id)) return false;
    const focusAreaIds = employee.focus_area_ids ?? [];
    if (focusAreaIds.length === 0) return true;
    return hasAnyNumber(focusAreaIds, focusAreaIdSet);
  });
  const entries = historicalPublishedEntries.filter((item) => {
    if (!reportDateSet.has(item.entry.date)) return false;
    if (!reportEmployeeIdSet.has(item.entry.empId)) return false;
    if (focusAreaIdSet.size === 0) return true;
    return getEntryFocusAreaIds(item, shiftById).some((id) => focusAreaIdSet.has(id));
  });
  const shiftEntries = entries.filter((item) => item.entry.kind === "shift");
  const absenceEntries = entries.filter((item) => item.entry.kind === "absence");
  const activeEmployees = reportEmployees.filter((employee) => employee.status === "active");
  const overtimeThresholdHours = 40 * Math.ceil(Math.max(1, reportDates.length) / 7);
  const pendingInvitationByEmployeeId = new Map(
    source.invitations
      .filter((row) => row.employee_id)
      .map((row) => [row.employee_id!, row.email ?? "Pending"]),
  );
  const filterOptions = {
    employees: source.employees.map((employee) => ({
      id: employee.id,
      label: formatName(employee),
      status: employee.status ?? "unknown",
      focusAreaIds: employee.focus_area_ids ?? [],
    })),
    focusAreas: source.focusAreas.map((focusArea) => ({
      id: String(focusArea.id),
      label: getNamedValue(focusArea),
    })),
    dates: rangeDates,
  };

  const employeeDirectory = rosterEmployees.map((employee) => ({
    employeeId: employee.id,
    employeeNumber: employee.employee_number,
    employeeName: formatName(employee),
    status: employee.status ?? "unknown",
    employmentType: employee.employment_type ?? "full_time",
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    focusAreas: formatList(employee.focus_area_ids, focusAreaById, "Unknown focus area"),
    roles: formatList(employee.role_ids, roleById, "Unknown role"),
    certification:
      employee.certification_id == null
        ? ""
        : (certificationById.get(employee.certification_id) ?? "Unknown certification"),
    departments: formatList(
      resolveEmployeeDepartmentIds(employee, focusAreaDepartmentIdById),
      departmentById,
      "Unknown department",
    ),
  }));

  const staffHours = reportEmployees.map((employee) => {
    const employeeEntries = entries.filter((item) => item.entry.empId === employee.id);
    const workedEntries = employeeEntries.filter((item) => item.entry.kind === "shift");
    const absenceCount = employeeEntries.filter((item) => item.entry.kind === "absence").length;
    const scheduledHours = roundHours(
      workedEntries.reduce(
        (sum, item) => sum + getReportEntryDurationHours(item, shiftById, focusAreaIdSet),
        0,
      ),
    );
    const workedDays = new Set(workedEntries.map((item) => item.entry.date)).size;
    const overtimeHours = roundHours(Math.max(0, scheduledHours - overtimeThresholdHours));

    return {
      employeeId: employee.id,
      employeeName: formatName(employee),
      status: employee.status ?? "unknown",
      focusAreas: formatList(employee.focus_area_ids, focusAreaById, "Unknown focus area"),
      scheduledHours,
      shiftCount: workedEntries.length,
      workedDays,
      absenceCount,
      overtimeHours,
      overtime: overtimeHours > 0,
    };
  });

  const coverage: CoverageReportRow[] = [];
  for (const requirement of source.coverageRequirements) {
    if (focusAreaIdSet.size > 0 && !focusAreaIdSet.has(requirement.focus_area_id)) {
      continue;
    }

    for (const date of reportDates) {
      const dayOfWeek = parseIsoDateUtc(date).getUTCDay();
      if (requirement.day_of_week != null && requirement.day_of_week !== dayOfWeek) {
        continue;
      }

      const scheduledEmployeeIds = new Set<string>();
      for (const { entry, source: row } of shiftEntries) {
        for (const segment of entry.segments ?? []) {
          const segmentFocusAreaId = getSegmentFocusAreaId(segment, row, shiftById);
          if (entry.date !== date || segmentFocusAreaId !== requirement.focus_area_id) {
            continue;
          }
          const shiftMatches =
            requirement.preferred_shift_id == null ||
            segment.shiftId === requirement.preferred_shift_id;
          const jobMatches = requirement.job_id == null || segment.jobId === requirement.job_id;
          if (shiftMatches && jobMatches) {
            scheduledEmployeeIds.add(entry.empId);
          }
        }

        if ((entry.segments ?? []).length > 0) {
          continue;
        }

        const rowFocusAreaIds = getEntryFocusAreaIds({ entry, source: row }, shiftById);
        if (
          entry.date === date &&
          rowFocusAreaIds.includes(requirement.focus_area_id) &&
          requirement.preferred_shift_id == null
        ) {
          scheduledEmployeeIds.add(entry.empId);
        }
      }

      const required = requirement.min_staff;
      const scheduled = scheduledEmployeeIds.size;
      coverage.push({
        date,
        focusArea: focusAreaById.get(requirement.focus_area_id) ?? "Unknown focus area",
        shift:
          requirement.preferred_shift_id == null
            ? "Any shift"
            : (shiftNameById.get(requirement.preferred_shift_id) ?? "Unknown shift"),
        job:
          requirement.job_id == null
            ? "Any job"
            : (jobById.get(requirement.job_id) ?? "Unknown job"),
        required,
        scheduled,
        openSlots: Math.max(0, required - scheduled),
        coveragePct: percent(scheduled, required),
      });
    }
  }

  const totalRequired = coverage.reduce((sum, row) => sum + row.required, 0);
  const totalScheduledForCoverage = coverage.reduce(
    (sum, row) => sum + Math.min(row.scheduled, row.required),
    0,
  );
  const totalOpenSlots = coverage.reduce((sum, row) => sum + row.openSlots, 0);
  const coveragePct = percent(totalScheduledForCoverage, totalRequired);
  const scheduledStaffCount = new Set(shiftEntries.map((item) => item.entry.empId)).size;

  const shiftRequests = source.shiftRequests
    .filter((request) => {
      const requestDates = [request.requester_shift_date, request.target_shift_date ?? ""].filter(
        Boolean,
      );
      if (!requestDates.some((date) => reportDateSet.has(date))) return false;
      if (employeeIdSet.size > 0) {
        const requestEmployeeIds = [request.requester_emp_id, request.target_emp_id ?? ""].filter(
          Boolean,
        );
        if (!requestEmployeeIds.some((id) => employeeIdSet.has(id))) return false;
      }
      if (focusAreaIdSet.size > 0) {
        const requestEmployees = [
          employeeById.get(request.requester_emp_id),
          request.target_emp_id ? employeeById.get(request.target_emp_id) : null,
        ].filter((employee): employee is EmployeeReportRow => employee != null);
        if (
          !requestEmployees.some((employee) =>
            hasAnyNumber(employee.focus_area_ids, focusAreaIdSet),
          )
        ) {
          return false;
        }
      }
      return true;
    })
    .map((request) => {
      const resolvedAt = request.resolved_at ?? "";
      const resolutionHours = request.resolved_at
        ? roundHours(
            (new Date(request.resolved_at).getTime() - new Date(request.created_at).getTime()) /
              3_600_000,
          )
        : null;

      return {
        id: request.id,
        type: request.type,
        status: request.status,
        requester: employeeNameById.get(request.requester_emp_id) ?? "Unknown employee",
        target: request.target_emp_id
          ? (employeeNameById.get(request.target_emp_id) ?? "Unknown employee")
          : "",
        requesterShiftDate: request.requester_shift_date,
        targetShiftDate: request.target_shift_date ?? "",
        createdAt: request.created_at,
        resolvedAt,
        resolutionHours,
      };
    });

  const absenceRows: AbsenceCalloffReportRow[] = absenceEntries.map(({ entry }) => ({
    kind: "absence",
    employeeName: employeeNameById.get(entry.empId) ?? "Unknown employee",
    date: entry.date,
    absenceType: entry.label,
    status: "published",
  }));
  const calloffRows: AbsenceCalloffReportRow[] = source.shiftRequests
    .filter((request) => {
      if (request.type !== "calloff" || request.status !== "approved") {
        return false;
      }
      if (!reportDateSet.has(request.requester_shift_date)) return false;
      const requester = employeeById.get(request.requester_emp_id);
      if (!requester) return false;
      return hasAnyNumber(requester.focus_area_ids, focusAreaIdSet);
    })
    .map((request) => ({
      kind: "calloff",
      employeeName: employeeNameById.get(request.requester_emp_id) ?? "Unknown employee",
      date: request.requester_shift_date,
      absenceType:
        request.absence_type_id == null
          ? ""
          : (absenceTypeById.get(request.absence_type_id) ?? "Unknown absence type"),
      status: request.status,
    }));

  const rosterStatus = rosterEmployees.map((employee) => ({
    employeeId: employee.id,
    employeeNumber: employee.employee_number,
    employeeName: formatName(employee),
    status: employee.status ?? "unknown",
    employmentType: employee.employment_type ?? "full_time",
    focusAreas: formatList(employee.focus_area_ids, focusAreaById, "Unknown focus area"),
    roles: formatList(employee.role_ids, roleById, "Unknown role"),
    certification:
      employee.certification_id == null
        ? ""
        : (certificationById.get(employee.certification_id) ?? "Unknown certification"),
    departments: formatList(
      resolveEmployeeDepartmentIds(employee, focusAreaDepartmentIdById),
      departmentById,
      "Unknown department",
    ),
    linkedAccount: Boolean(employee.user_id),
    pendingInvitation: pendingInvitationByEmployeeId.get(employee.id) ?? "",
  }));
  const certificationRoleMatrix = rosterEmployees.map((employee) => ({
    employeeId: employee.id,
    employeeNumber: employee.employee_number,
    employeeName: formatName(employee),
    status: employee.status ?? "unknown",
    certification:
      employee.certification_id == null
        ? ""
        : (certificationById.get(employee.certification_id) ?? "Unknown certification"),
    roles: formatList(employee.role_ids, roleById, "Unknown role"),
    focusAreas: formatList(employee.focus_area_ids, focusAreaById, "Unknown focus area"),
    departments: formatList(
      resolveEmployeeDepartmentIds(employee, focusAreaDepartmentIdById),
      departmentById,
      "Unknown department",
    ),
    missingCertification: employee.certification_id == null,
    missingRole: (employee.role_ids ?? []).length === 0,
  }));
  const accountAccess = rosterEmployees.map((employee) => {
    const pendingInvitation = pendingInvitationByEmployeeId.get(employee.id) ?? "";
    const linkedAccount = Boolean(employee.user_id);
    return {
      employeeId: employee.id,
      employeeNumber: employee.employee_number,
      employeeName: formatName(employee),
      status: employee.status ?? "unknown",
      email: employee.email ?? "",
      linkedAccount,
      pendingInvitation,
      accountAccessStatus: linkedAccount
        ? "Linked"
        : pendingInvitation
          ? "Invitation pending"
          : "Not invited",
    };
  });

  const scheduleMatrix = {
    dates: reportDates,
    rows: reportEmployees.map((employee) => {
      const cells: Record<string, string> = {};
      for (const date of reportDates) {
        const labels = entries
          .filter((item) => item.entry.empId === employee.id && item.entry.date === date)
          .map((item) => item.entry.label);
        cells[date] = labels.join(" / ");
      }
      return {
        employeeId: employee.id,
        employeeName: formatName(employee),
        cells,
      };
    }),
  };

  const totalScheduledHours = roundHours(
    staffHours.reduce((sum, row) => sum + row.scheduledHours, 0),
  );
  const shiftPeriodSummary: ShiftPeriodSummaryReport = {
    startDate: range.startDate,
    endDate: range.endDate,
    dayCount: reportDates.length,
    activeStaffCount: activeEmployees.length,
    scheduledStaffCount,
    totalScheduledHours,
    totalShifts: shiftEntries.length,
    totalAbsences: absenceEntries.length,
    overtimeAlertCount: staffHours.filter((row) => row.overtime).length,
    openSlotCount: totalOpenSlots,
    coveragePct,
    requestCount: shiftRequests.length,
  };

  return {
    orgId: source.org.id,
    orgName: source.org.name,
    orgTimezone: source.org.timezone,
    generatedAt: source.generatedAt ?? new Date().toISOString(),
    range,
    payPeriodStartDate: source.org.pay_period_start_date,
    filters: {
      employeeIds: [...employeeIdSet],
      focusAreaIds: [...focusAreaIdSet],
      dates: dates.length > 0 ? dates : [],
    },
    filterOptions,
    reports: {
      employeeDirectory,
      staffHours,
      coverage,
      shiftPeriodSummary,
      shiftRequests,
      absencesCalloffs: [...absenceRows, ...calloffRows].sort((left, right) =>
        left.date.localeCompare(right.date),
      ),
      rosterStatus,
      certificationRoleMatrix,
      accountAccess,
      scheduleMatrix,
    },
  };
}

function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const normalized = String(value);
  if (
    normalized.includes(",") ||
    normalized.includes('"') ||
    normalized.includes("\n") ||
    normalized.includes("\r")
  ) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function buildCsv(headers: string[], rows: OperationsReportCell[][]): string {
  return [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsvField(formatReportCellForDisplay(cell))).join(","))
    .join("\r\n");
}

export interface OperationsReportTable {
  title: string;
  headers: string[];
  rows: OperationsReportCell[][];
}

export function buildOperationsReportTable(
  payload: OperationsReportPayload,
  report: OperationsReportType,
): OperationsReportTable {
  const preview = buildOperationsReportPreviewTable(payload, report);
  return {
    title: preview.title,
    headers: preview.columns.map((column) => column.label),
    rows: preview.rows,
  };
}

export function buildOperationsReportCsv(
  payload: OperationsReportPayload,
  report: OperationsReportType,
): string {
  const table = buildOperationsReportTable(payload, report);
  return buildCsv(table.headers, table.rows);
}

function normalizePdfText(value: OperationsReportCell): string {
  return formatReportCellForDisplay(value)
    .replace(/\u00A0/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...");
}

function wrapPdfCell(value: OperationsReportCell, width: number, fontSize: number): string[] {
  const text = normalizePdfText(value).replace(/\s+/g, " ").trim();
  const maxChars = Math.max(4, Math.floor(width / (fontSize * 0.56)));
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const parts =
      word.length > maxChars
        ? Array.from({ length: Math.ceil(word.length / maxChars) }, (_, index) =>
            word.slice(index * maxChars, (index + 1) * maxChars),
          )
        : [word];
    for (const part of parts) {
      const next = current ? `${current} ${part}` : part;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = part;
      } else {
        current = next;
      }
    }
  }

  if (current) lines.push(current);
  if (lines.length === 0) return ["-"];
  return lines;
}

function pdfTextCommand(
  x: number,
  y: number,
  size: number,
  value: string,
  color?: [number, number, number],
  font = "F1",
): string {
  const command = `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm <${encodeWinAnsiHex(value)}> Tj ET`;
  if (!color) return command;
  const [red, green, blue] = color.map((channel) => channel.toFixed(3));
  return `q ${red} ${green} ${blue} rg ${command} Q`;
}

function pdfFillRectCommand(
  x: number,
  y: number,
  width: number,
  height: number,
  gray: number,
): string {
  const shade = gray.toFixed(3);
  return `q ${shade} ${shade} ${shade} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f Q`;
}

function pdfFillRgbRectCommand(
  x: number,
  y: number,
  width: number,
  height: number,
  color: [number, number, number],
): string {
  const [red, green, blue] = color.map((channel) => channel.toFixed(3));
  return `q ${red} ${green} ${blue} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f Q`;
}

function estimatePdfTextWidth(value: string, size: number): number {
  return value.length * size * 0.56;
}

function pdfDubGridLogoCommands(x: number, top: number, size = 24): string[] {
  const cell = size / 4;
  const gap = cell * 0.1;
  const square = cell - gap * 2;
  const ink: [number, number, number] = [0.059, 0.09, 0.141];
  const medium: [number, number, number] = [0.294, 0.318, 0.356];
  const light: [number, number, number] = [0.718, 0.727, 0.742];
  const commands: string[] = [];

  for (const row of [0, 1, 2, 3]) {
    for (const col of [0, 1, 2, 3]) {
      const color = row === 0 || col === 0 ? ink : row + col <= 4 ? medium : light;
      commands.push(
        pdfFillRgbRectCommand(
          x + col * cell + gap,
          top - row * cell - gap - square,
          square,
          square,
          color,
        ),
      );
    }
  }

  return commands;
}

function pdfImageCommand(
  name: string,
  x: number,
  top: number,
  width: number,
  height: number,
): string {
  return `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${(top - height).toFixed(2)} cm /${name} Do Q`;
}

type PdfPngImage = {
  width: number;
  height: number;
  rgb: Uint8Array;
  alpha: Uint8Array | null;
};

let cachedReportLogo: PdfPngImage | null | undefined;
let cachedReportWordmark: PdfPngImage | null | undefined;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function paethPredictor(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function parseRgbaPng(buffer: Buffer, tintColor?: [number, number, number]): PdfPngImage {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("Report logo must be a PNG image.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlaceMethod = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.byteLength) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      interlaceMethod = data[12] ?? 0;
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (width <= 0 || height <= 0 || bitDepth !== 8 || colorType !== 6 || interlaceMethod !== 0) {
    throw new Error("Report logo PNG must be non-interlaced 8-bit RGBA.");
  }

  const compressed = Buffer.concat(idatChunks);
  const inflated = inflateSync(compressed);
  const bytesPerPixel = 4;
  const rowLength = width * bytesPerPixel;
  const raw = new Uint8Array(width * height * bytesPerPixel);
  let sourceOffset = 0;

  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset] ?? 0;
    sourceOffset += 1;
    const rowOffset = row * rowLength;

    for (let column = 0; column < rowLength; column += 1) {
      const encoded = inflated[sourceOffset + column] ?? 0;
      const left = column >= bytesPerPixel ? (raw[rowOffset + column - bytesPerPixel] ?? 0) : 0;
      const up = row > 0 ? (raw[rowOffset - rowLength + column] ?? 0) : 0;
      const upperLeft =
        row > 0 && column >= bytesPerPixel
          ? (raw[rowOffset - rowLength + column - bytesPerPixel] ?? 0)
          : 0;
      let decoded = encoded;

      if (filter === 1) {
        decoded = encoded + left;
      } else if (filter === 2) {
        decoded = encoded + up;
      } else if (filter === 3) {
        decoded = encoded + Math.floor((left + up) / 2);
      } else if (filter === 4) {
        decoded = encoded + paethPredictor(left, up, upperLeft);
      } else if (filter !== 0) {
        throw new Error("Report logo PNG uses an unsupported filter.");
      }

      raw[rowOffset + column] = decoded & 0xff;
    }

    sourceOffset += rowLength;
  }

  const pixelCount = width * height;
  const rgb = new Uint8Array(pixelCount * 3);
  const alpha = new Uint8Array(pixelCount);
  let hasAlpha = false;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const rawOffset = pixel * 4;
    const rgbOffset = pixel * 3;
    alpha[pixel] = raw[rawOffset + 3] ?? 255;
    if (tintColor && alpha[pixel] > 0) {
      rgb[rgbOffset] = Math.round(tintColor[0] * 255);
      rgb[rgbOffset + 1] = Math.round(tintColor[1] * 255);
      rgb[rgbOffset + 2] = Math.round(tintColor[2] * 255);
    } else {
      rgb[rgbOffset] = raw[rawOffset] ?? 0;
      rgb[rgbOffset + 1] = raw[rawOffset + 1] ?? 0;
      rgb[rgbOffset + 2] = raw[rawOffset + 2] ?? 0;
    }
    if (alpha[pixel] !== 255) {
      hasAlpha = true;
    }
  }

  return {
    width,
    height,
    rgb: deflateSync(rgb),
    alpha: hasAlpha ? deflateSync(alpha) : null,
  };
}

/**
 * Reads one of the app's own brand PNGs for the PDF export.
 *
 * Each readFileSync takes a fully literal path, and the two locations are
 * spelled out rather than looped over, because Turbopack resolves that argument
 * statically to decide what to trace. Handing it a loop variable made it give
 * up and trace the *whole project* into the server output — every source file
 * and the entire public folder, on every serverless function — which is dead
 * weight on each cold start.
 *
 * Two locations because cwd differs depending on whether the app was started
 * from the monorepo root or from apps/web. A miss returns null rather than
 * throwing, so a PDF still renders (without the artwork) in an environment that
 * does not expose public assets.
 */
function readBrandAsset(name: "logo" | "wordmark-white"): Buffer | null {
  if (name === "logo") {
    try {
      return readFileSync(join(process.cwd(), "public", "logo.png"));
    } catch {
      /* fall through to the monorepo-root location */
    }
    try {
      return readFileSync(join(process.cwd(), "apps", "web", "public", "logo.png"));
    } catch {
      return null;
    }
  }

  try {
    return readFileSync(join(process.cwd(), "public", "wordmark-white.png"));
  } catch {
    /* fall through to the monorepo-root location */
  }
  try {
    return readFileSync(join(process.cwd(), "apps", "web", "public", "wordmark-white.png"));
  } catch {
    return null;
  }
}

function getReportLogo(): PdfPngImage | null {
  if (cachedReportLogo !== undefined) return cachedReportLogo;

  const bytes = readBrandAsset("logo");
  cachedReportLogo = bytes ? parseRgbaPng(bytes) : null;
  return cachedReportLogo;
}

function getReportWordmark(): PdfPngImage | null {
  if (cachedReportWordmark !== undefined) return cachedReportWordmark;

  const bytes = readBrandAsset("wordmark-white");
  cachedReportWordmark = bytes ? parseRgbaPng(bytes, [0.059, 0.09, 0.141]) : null;
  return cachedReportWordmark;
}

function formatPdfDateRangeLabel(range: OperationsReportRange): string {
  return `${formatReportDateForDisplay(range.startDate)} to ${formatReportDateForDisplay(range.endDate)}`;
}

function formatPdfPrintedDate(value: string, timeZone: string | null): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };

  try {
    return new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: timeZone ?? "UTC",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: "UTC",
    }).format(date);
  }
}

function addOperationsPdfHeader(
  commands: string[],
  payload: OperationsReportPayload,
  report: OperationsReportType,
  table: OperationsReportTable,
  margin: number,
  top: number,
  contentWidth: number,
  hasLogo: boolean,
  hasWordmark: boolean,
): number {
  const logoSize = 24;
  const ink: [number, number, number] = [0.059, 0.09, 0.141];
  const orgText: [number, number, number] = [0.29, 0.376, 0.502];
  const muted: [number, number, number] = [0.29, 0.376, 0.502];
  const divider: [number, number, number] = [0.059, 0.09, 0.141];
  const wordmarkWidth = 72;
  const wordmarkHeight = 25.5;
  const wordmarkSize = 18;
  const orgSize = 11;
  const separatorHeight = 16;
  const separatorPadding = 5;
  const separatorVisualWidth = 2.4;
  const separatorStrokeWidth = 0.8;
  const printedSize = 8;
  const titleSize = 9;
  const wordmark = "dubgrid";
  const lineCenterY = top - logoSize / 2;
  const textCenterOffset = 0.26;
  const orgTextCenterOffset = 0.35;
  const logoTop = lineCenterY + logoSize / 2;
  const brandBaseline = lineCenterY - wordmarkSize * textCenterOffset;
  const wordmarkX = margin + logoSize + 8;
  const wordmarkTop = lineCenterY + wordmarkHeight / 2;
  const renderedWordmarkWidth = hasWordmark
    ? wordmarkWidth
    : estimatePdfTextWidth(wordmark, wordmarkSize);
  const separatorX = wordmarkX + renderedWordmarkWidth + separatorPadding;
  const separatorStrokeX = separatorX + (separatorVisualWidth - separatorStrokeWidth) / 2;
  const separatorY = lineCenterY - separatorHeight / 2;
  const orgX = separatorX + separatorVisualWidth + separatorPadding;
  const orgBaseline = lineCenterY - orgSize * orgTextCenterOffset;
  const printedY = top - 38;
  const dividerY = top - 48;
  const titleLabel = REPORTS_WITHOUT_DATE_HEADER.has(report)
    ? table.title
    : `${table.title} - ${formatPdfDateRangeLabel(payload.range)}`;
  const printedLabel = `Printed ${formatPdfPrintedDate(payload.generatedAt, payload.orgTimezone)}`;
  const printedX = margin + contentWidth - estimatePdfTextWidth(printedLabel, printedSize);

  if (hasLogo) {
    commands.push(pdfImageCommand("Logo", margin, logoTop, logoSize, logoSize));
  } else {
    commands.push(...pdfDubGridLogoCommands(margin, logoTop, logoSize));
  }
  if (hasWordmark) {
    commands.push(
      pdfImageCommand("Wordmark", wordmarkX, wordmarkTop, wordmarkWidth, wordmarkHeight),
    );
  } else {
    commands.push(pdfTextCommand(wordmarkX, brandBaseline, wordmarkSize, wordmark, ink, "F2"));
  }
  commands.push(
    pdfFillRgbRectCommand(
      separatorStrokeX,
      separatorY,
      separatorStrokeWidth,
      separatorHeight,
      [0.58, 0.639, 0.722],
    ),
  );
  commands.push(pdfTextCommand(orgX, orgBaseline, orgSize, payload.orgName, orgText));
  commands.push(pdfTextCommand(margin, printedY, titleSize, titleLabel, muted));
  commands.push(pdfTextCommand(printedX, printedY, printedSize, printedLabel, muted));
  commands.push(pdfFillRgbRectCommand(margin, dividerY, contentWidth, 1.4, divider));

  return dividerY - 16;
}

function encodeWinAnsiHex(value: string): string {
  const bytes: number[] = [];
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 63;
    if (codePoint >= 32 && codePoint <= 126) {
      bytes.push(codePoint);
      continue;
    }
    switch (codePoint) {
      case 0x00b7:
        bytes.push(0xb7);
        break;
      case 0x2022:
        bytes.push(0x95);
        break;
      case 0x2027:
        bytes.push(0xb7);
        break;
      case 0x2122:
        bytes.push(0x99);
        break;
      case 0x00a9:
        bytes.push(0xa9);
        break;
      case 0x00ae:
        bytes.push(0xae);
        break;
      case 0x00b0:
        bytes.push(0xb0);
        break;
      default:
        bytes.push(0x3f);
        break;
    }
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function pdfImageObject(
  image: PdfPngImage,
  channel: "rgb" | "alpha",
  smaskObjectId: number | null = null,
): string {
  const data = channel === "rgb" ? image.rgb : image.alpha;
  if (!data) {
    throw new Error("Missing PDF image channel.");
  }

  const stream = `${bytesToHex(data)}>`;
  const colorSpace = channel === "rgb" ? "/DeviceRGB" : "/DeviceGray";
  const smask = smaskObjectId == null ? "" : ` /SMask ${smaskObjectId} 0 R`;

  return `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter [/ASCIIHexDecode /FlateDecode]${smask} /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
}

function buildPdfDocument(
  pageStreams: string[],
  logo: PdfPngImage | null,
  wordmark: PdfPngImage | null,
): ArrayBuffer {
  const encoder = new TextEncoder();
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const fontObjectId = 3;
  const boldFontObjectId = 4;
  let logoObjectId: number | null = null;
  let wordmarkObjectId: number | null = null;

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[fontObjectId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[boldFontObjectId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  if (logo) {
    let smaskObjectId: number | null = null;
    if (logo.alpha) {
      smaskObjectId = objects.length;
      objects[smaskObjectId] = pdfImageObject(logo, "alpha");
    }
    logoObjectId = objects.length;
    objects[logoObjectId] = pdfImageObject(logo, "rgb", smaskObjectId);
  }

  if (wordmark) {
    let smaskObjectId: number | null = null;
    if (wordmark.alpha) {
      smaskObjectId = objects.length;
      objects[smaskObjectId] = pdfImageObject(wordmark, "alpha");
    }
    wordmarkObjectId = objects.length;
    objects[wordmarkObjectId] = pdfImageObject(wordmark, "rgb", smaskObjectId);
  }

  for (const stream of pageStreams) {
    const contentId = objects.length;
    objects[contentId] =
      `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`;
    const pageId = objects.length;
    const xObjects = [
      logoObjectId == null ? "" : `/Logo ${logoObjectId} 0 R`,
      wordmarkObjectId == null ? "" : `/Wordmark ${wordmarkObjectId} 0 R`,
    ].filter(Boolean);
    const xObjectResources = xObjects.length === 0 ? "" : ` /XObject << ${xObjects.join(" ")} >>`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 ${fontObjectId} 0 R /F2 ${boldFontObjectId} 0 R >>${xObjectResources} >> /Contents ${contentId} 0 R >>`;
    pageObjectIds.push(pageId);
  }

  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = encoder.encode(pdf).length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return toArrayBuffer(encoder.encode(pdf));
}

export function buildOperationsReportPdf(
  payload: OperationsReportPayload,
  report: OperationsReportType,
): ArrayBuffer {
  const table = buildOperationsReportTable(payload, report);
  const pageStreams: string[] = [];
  const logo = getReportLogo();
  const wordmark = getReportWordmark();
  const margin = 32;
  const pageHeight = 612;
  const contentWidth = 792 - margin * 2;
  const bodyFontSize = table.headers.length > 8 ? 6 : 7;
  const headerFontSize = table.headers.length > 8 ? 6 : 7;
  const baseLineHeight = table.headers.length > 8 ? 8 : 9;
  let commands: string[] = [];
  let y = pageHeight - margin;
  let bodyRowIndex = 0;

  const startPage = () => {
    if (commands.length > 0) {
      pageStreams.push(commands.join("\n"));
    }
    commands = [];
    y = pageHeight - margin;
  };

  const addLine = (value: string, size = 9, gap = 12) => {
    if (y < margin + gap) startPage();
    commands.push(pdfTextCommand(margin, y, size, value));
    y -= gap;
  };

  y = addOperationsPdfHeader(
    commands,
    payload,
    report,
    table,
    margin,
    y,
    contentWidth,
    logo != null,
    wordmark != null,
  );

  const details = buildOperationsReportMetrics(payload, report);
  if (details.length > 0) {
    addLine(details.map((metric) => `${metric.label}: ${metric.value}`).join(" | "), 8, 16);
  }

  const firstColumnWidth = Math.min(128, Math.max(82, contentWidth * 0.18));
  const remainingWidth = contentWidth - firstColumnWidth;
  const otherColumnCount = Math.max(1, table.headers.length - 1);
  const widths = table.headers.map((_, index) =>
    index === 0 ? firstColumnWidth : remainingWidth / otherColumnCount,
  );

  const addTableRow = (cells: OperationsReportCell[], isHeader = false) => {
    const fontSize = isHeader ? headerFontSize : bodyFontSize;
    const verticalPadding = isHeader ? 5 : 6;
    const wrapped = cells.map((cell, index) => wrapPdfCell(cell, widths[index] ?? 48, fontSize));
    const lineCount = Math.max(...wrapped.map((cellLines) => cellLines.length));
    const rowHeight = verticalPadding * 2 + fontSize + Math.max(0, lineCount - 1) * baseLineHeight;

    if (y - rowHeight < margin) {
      startPage();
      addTableRow(table.headers, true);
    }

    if (!isHeader && bodyRowIndex % 2 === 1) {
      commands.push(
        pdfFillRectCommand(
          margin - 4,
          y - rowHeight,
          contentWidth + 8,
          rowHeight,
          REPORT_PDF_STRIPED_ROW_GRAY,
        ),
      );
    }

    let x = margin;
    const firstBaseline = y - verticalPadding - fontSize;
    for (let columnIndex = 0; columnIndex < wrapped.length; columnIndex += 1) {
      const cellLines = wrapped[columnIndex] ?? ["-"];
      for (let lineIndex = 0; lineIndex < cellLines.length; lineIndex += 1) {
        commands.push(
          pdfTextCommand(
            x,
            firstBaseline - lineIndex * baseLineHeight,
            fontSize,
            cellLines[lineIndex],
          ),
        );
      }
      x += widths[columnIndex] ?? 48;
    }
    y -= rowHeight;
    if (!isHeader) {
      bodyRowIndex += 1;
    }
  };

  addTableRow(table.headers, true);
  if (table.rows.length === 0) {
    addLine("No rows for this report.", 8, 10);
  } else {
    for (const row of table.rows) {
      addTableRow(row);
    }
  }

  if (commands.length > 0) {
    pageStreams.push(commands.join("\n"));
  }

  return buildPdfDocument(pageStreams, logo, wordmark);
}

async function fetchTableRows<T>(
  promise: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const { data, error } = await promise;
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function loadOperationsReport(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    range: OperationsReportRange;
    filters?: OperationsReportFilters;
  },
): Promise<OperationsReportPayload> {
  const now = new Date().toISOString();
  const [
    orgRows,
    employees,
    historicalEmployees,
    focusAreas,
    roles,
    certifications,
    departments,
    absenceTypes,
    coverageRequirements,
    shiftCategories,
    jobs,
    shiftRequests,
    invitations,
    publishedRows,
  ] = await Promise.all([
    fetchTableRows<OrganizationRow>(
      serviceClient
        .from("organizations")
        .select("id, name, timezone, pay_period_start_date")
        .eq("id", input.orgId)
        .limit(1),
    ),
    fetchTableRows<EmployeeReportRow>(
      serviceClient
        .from("employees")
        .select(
          "id, employee_number, first_name, last_name, employment_type, email, phone, status, seniority, focus_area_ids, certification_id, role_ids, department_ids, user_id",
        )
        .eq("org_id", input.orgId)
        .is("archived_at", null)
        .order("seniority", { ascending: true }),
    ),
    fetchTableRows<EmployeeReportRow>(
      serviceClient
        .from("employees")
        .select(
          "id, employee_number, first_name, last_name, employment_type, email, phone, status, seniority, focus_area_ids, certification_id, role_ids, department_ids, user_id",
        )
        .eq("org_id", input.orgId)
        .not("archived_at", "is", null)
        .order("seniority", { ascending: true }),
    ),
    fetchTableRows<FocusAreaRow>(
      serviceClient
        .from("focus_areas")
        .select("id, name, department_id")
        .eq("org_id", input.orgId)
        .is("archived_at", null),
    ),
    fetchTableRows<NamedRow>(
      serviceClient
        .from("organization_roles")
        .select("id, name, abbr")
        .eq("org_id", input.orgId)
        .is("archived_at", null),
    ),
    fetchTableRows<NamedRow>(
      serviceClient
        .from("certifications")
        .select("id, name, abbr")
        .eq("org_id", input.orgId)
        .is("archived_at", null),
    ),
    fetchTableRows<NamedRow>(
      serviceClient
        .from("departments")
        .select("id, name, abbr")
        .eq("org_id", input.orgId)
        .is("archived_at", null),
    ),
    fetchTableRows<NamedRow>(
      serviceClient
        .from("absence_types")
        .select("id, label, name")
        .eq("org_id", input.orgId)
        .is("archived_at", null),
    ),
    fetchTableRows<CoverageRequirementRow>(
      serviceClient
        .from("coverage_requirements")
        .select("id, focus_area_id, job_id, preferred_shift_id, day_of_week, min_staff")
        .eq("org_id", input.orgId),
    ),
    fetchTableRows<ShiftCategoryRow>(
      serviceClient
        .from("shift_categories")
        .select("id, name, focus_area_id")
        .eq("org_id", input.orgId)
        .is("archived_at", null),
    ),
    fetchTableRows<NamedRow>(
      serviceClient
        .from("jobs")
        .select("id, name")
        .eq("org_id", input.orgId)
        .is("archived_at", null),
    ),
    fetchTableRows<ShiftRequestRow>(
      serviceClient
        .from("shift_requests")
        .select(
          "id, type, status, requester_emp_id, target_emp_id, requester_shift_date, target_shift_date, absence_type_id, created_at, resolved_at, updated_at",
        )
        .eq("org_id", input.orgId)
        .or(
          [
            `and(requester_shift_date.gte.${input.range.startDate},requester_shift_date.lte.${input.range.endDate})`,
            `and(target_shift_date.gte.${input.range.startDate},target_shift_date.lte.${input.range.endDate})`,
          ].join(","),
        )
        .order("created_at", { ascending: false }),
    ),
    fetchTableRows<InvitationRow>(
      serviceClient
        .from("invitations")
        .select("employee_id, email, expires_at")
        .eq("org_id", input.orgId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gte("expires_at", now),
    ),
    fetchPublishedShiftRows(serviceClient, {
      orgId: input.orgId,
      startDate: input.range.startDate,
      endDate: input.range.endDate,
      orderAscending: true,
    }) as Promise<PublishedShiftReportRow[]>,
  ]);

  const org = orgRows[0];
  if (!org) {
    throw new Error("Organization not found");
  }

  return buildOperationsReportPayload(
    {
      org,
      employees,
      historicalEmployees,
      focusAreas,
      roles,
      certifications,
      departments,
      absenceTypes,
      coverageRequirements,
      shiftCategories,
      jobs,
      shiftRequests,
      invitations,
      publishedRows,
    },
    input.range,
    input.filters,
  );
}
