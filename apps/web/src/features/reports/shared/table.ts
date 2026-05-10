import type {
  OperationsReportPayload,
  OperationsReportType,
} from "@/features/reports/server/operations";

export type OperationsReportCell = string | number | boolean | null | undefined;

export interface OperationsReportPreviewColumn {
  label: string;
}

export interface OperationsReportPreviewTable {
  title: string;
  columns: OperationsReportPreviewColumn[];
  rows: OperationsReportCell[][];
  emptyText: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const REPORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const REPORT_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const REPORT_VALUE_LABELS: Record<string, string> = {
  active: "Active",
  approved: "Approved",
  absence: "Scheduled absence",
  benched: "Benched",
  calloff: "Call-off",
  cancelled: "Cancelled",
  expired: "Expired",
  full_time: "Full-time",
  "N/A": "Not available",
  open: "Open",
  part_time: "Part-time",
  pending_approval: "Awaiting approval",
  pickup: "Pickup",
  published: "Published",
  rejected: "Rejected",
  swap: "Swap",
  terminated: "Terminated",
  unknown: "Unknown",
};

function formatReportNumber(value: number): string {
  return REPORT_NUMBER_FORMATTER.format(value);
}

export function formatReportDateForDisplay(value: string): string {
  if (!ISO_DATE_PATTERN.test(value)) return value;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return REPORT_DATE_FORMATTER.format(date);
}

function formatKnownReportValue(value: string): string {
  if (ISO_DATE_PATTERN.test(value)) return formatReportDateForDisplay(value);
  return REPORT_VALUE_LABELS[value] ?? value;
}

export function formatReportCellForDisplay(value: OperationsReportCell): string {
  if (value == null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return formatReportNumber(value);
  return formatKnownReportValue(value);
}

function formatListValue(value: string, emptyLabel: string): string {
  return value.trim() ? value : emptyLabel;
}

function formatContactValue(value: string, emptyLabel: string): string {
  return value.trim() ? value : emptyLabel;
}

function formatAccountLinked(value: boolean): string {
  return value ? "Linked" : "Not linked";
}

function formatInvitationStatus(value: string): string {
  return value.trim() ? `Pending invitation (${value})` : "No pending invitation";
}

function formatMissingCertification(value: boolean): string {
  return value ? "Missing certification" : "Certification recorded";
}

function formatMissingRole(value: boolean): string {
  return value ? "Missing role" : "Role assigned";
}

function formatResolutionHours(value: number | null): string {
  if (value == null) return "Not resolved";
  return `${formatReportNumber(value)} ${value === 1 ? "hour" : "hours"}`;
}

export function buildOperationsReportPreviewTable(
  payload: OperationsReportPayload,
  report: OperationsReportType,
): OperationsReportPreviewTable {
  switch (report) {
    case "employee-directory":
      return {
        title: "Employee directory",
        columns: [
          { label: "Employee" },
          { label: "Staff status" },
          { label: "Employment type" },
          { label: "Email" },
          { label: "Phone" },
          { label: "Focus areas" },
          { label: "Roles" },
          { label: "Certification" },
        ],
        rows: payload.reports.employeeDirectory.map((row) => [
          row.employeeName,
          formatKnownReportValue(row.status),
          formatKnownReportValue(row.employmentType),
          formatContactValue(row.email, "No email"),
          formatContactValue(row.phone, "No phone"),
          formatListValue(row.focusAreas, "No focus areas"),
          formatListValue(row.roles, "No roles"),
          formatListValue(row.certification, "No certification"),
        ]),
        emptyText: "No staff records found.",
      };
    case "staff-hours":
      return {
        title: "Staff hours",
        columns: [
          { label: "Employee" },
          { label: "Scheduled hours" },
          { label: "Shifts worked" },
          { label: "Days worked" },
          { label: "Absence days" },
          { label: "Overtime hours" },
        ],
        rows: payload.reports.staffHours
          .filter((row) => row.shiftCount > 0 || row.absenceCount > 0)
          .map((row) => [
            row.employeeName,
            row.scheduledHours,
            row.shiftCount,
            row.workedDays,
            row.absenceCount,
            row.overtimeHours,
          ]),
        emptyText: "No published schedule for this range.",
      };
    case "coverage":
      return {
        title: "Coverage",
        columns: [
          { label: "Date" },
          { label: "Focus area" },
          { label: "Shift" },
          { label: "Job" },
          { label: "Required" },
          { label: "Scheduled" },
          { label: "Open slots" },
        ],
        rows: payload.reports.coverage.map((row) => [
          formatReportDateForDisplay(row.date),
          row.focusArea,
          row.shift,
          row.job,
          row.required,
          row.scheduled,
          row.openSlots,
        ]),
        emptyText: "No coverage requirements for this range.",
      };
    case "shift-period-summary": {
      const summary = payload.reports.shiftPeriodSummary;
      return {
        title: "Period summary",
        columns: [{ label: "Metric" }, { label: "Value" }],
        rows: [
          ["Scheduled hours", summary.totalScheduledHours],
          ["Shifts", summary.totalShifts],
          ["Scheduled staff", summary.scheduledStaffCount],
          ["Active staff", summary.activeStaffCount],
          ["Absences", summary.totalAbsences],
          ["Open slots", summary.openSlotCount],
          [
            "Coverage",
            summary.coveragePct == null
              ? "Not available"
              : `${summary.coveragePct}%`,
          ],
          ["Requests", summary.requestCount],
        ],
        emptyText: "No period data for this range.",
      };
    }
    case "shift-requests":
      return {
        title: "Shift requests",
        columns: [
          { label: "Request type" },
          { label: "Request status" },
          { label: "Requested by" },
          { label: "Requested with" },
          { label: "Shift date" },
          { label: "Time to resolution" },
        ],
        rows: payload.reports.shiftRequests.map((row) => [
          formatKnownReportValue(row.type),
          formatKnownReportValue(row.status),
          row.requester,
          formatListValue(row.target, "No teammate"),
          formatReportDateForDisplay(row.requesterShiftDate),
          formatResolutionHours(row.resolutionHours),
        ]),
        emptyText: "No matching requests for this range.",
      };
    case "absences-calloffs":
      return {
        title: "Absences and call-offs",
        columns: [
          { label: "Entry type" },
          { label: "Staff member" },
          { label: "Schedule date" },
          { label: "Absence type" },
          { label: "Status" },
        ],
        rows: payload.reports.absencesCalloffs.map((row) => [
          formatKnownReportValue(row.kind),
          row.employeeName,
          formatReportDateForDisplay(row.date),
          formatListValue(row.absenceType, "No absence type"),
          formatKnownReportValue(row.status),
        ]),
        emptyText: "No absences or approved call-offs for this range.",
      };
    case "roster-status":
      return {
        title: "Roster status",
        columns: [
          { label: "Employee" },
          { label: "Staff status" },
          { label: "Employment type" },
          { label: "Focus areas" },
          { label: "Roles" },
          { label: "Account linked" },
          { label: "Invitation status" },
        ],
        rows: payload.reports.rosterStatus.map((row) => [
          row.employeeName,
          formatKnownReportValue(row.status),
          formatKnownReportValue(row.employmentType),
          formatListValue(row.focusAreas, "No focus areas"),
          formatListValue(row.roles, "No roles"),
          formatAccountLinked(row.linkedAccount),
          formatInvitationStatus(row.pendingInvitation),
        ]),
        emptyText: "No staff records found.",
      };
    case "certification-role-matrix":
      return {
        title: "Certifications and roles",
        columns: [
          { label: "Employee" },
          { label: "Staff status" },
          { label: "Certification" },
          { label: "Roles" },
          { label: "Focus areas" },
          { label: "Departments" },
          { label: "Certification status" },
          { label: "Role status" },
        ],
        rows: payload.reports.certificationRoleMatrix.map((row) => [
          row.employeeName,
          formatKnownReportValue(row.status),
          formatListValue(row.certification, "No certification"),
          formatListValue(row.roles, "No roles"),
          formatListValue(row.focusAreas, "No focus areas"),
          formatListValue(row.departments, "No departments"),
          formatMissingCertification(row.missingCertification),
          formatMissingRole(row.missingRole),
        ]),
        emptyText: "No staff records found.",
      };
    case "account-access":
      return {
        title: "Account access",
        columns: [
          { label: "Employee" },
          { label: "Staff status" },
          { label: "Email" },
          { label: "Account linked" },
          { label: "Invitation status" },
          { label: "Access status" },
        ],
        rows: payload.reports.accountAccess.map((row) => [
          row.employeeName,
          formatKnownReportValue(row.status),
          formatContactValue(row.email, "No email"),
          formatAccountLinked(row.linkedAccount),
          formatInvitationStatus(row.pendingInvitation),
          row.accountAccessStatus,
        ]),
        emptyText: "No staff records found.",
      };
    case "schedule-matrix":
      return {
        title: "Schedule matrix",
        columns: [
          { label: "Employee" },
          ...payload.reports.scheduleMatrix.dates.map((date) => ({
            label: formatReportDateForDisplay(date),
          })),
        ],
        rows: payload.reports.scheduleMatrix.rows
          .filter((row) =>
            payload.reports.scheduleMatrix.dates.some((date) => row.cells[date]),
          )
          .map((row) => [
            row.employeeName,
            ...payload.reports.scheduleMatrix.dates.map(
              (date) => row.cells[date] ?? "",
            ),
          ]),
        emptyText: "No published schedule for this range.",
      };
  }
}
