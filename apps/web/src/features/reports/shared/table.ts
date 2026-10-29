import {
  EMPLOYMENT_STATUS_LABELS,
  capitalizeFirst,
  pluralLabelNoun,
  singularLabelNoun,
} from "@dubgrid/domain";
import type {
  OperationsReportPayload,
  OperationsReportType,
  ReportMetric,
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
// Submitted and decided instants, in UTC like every other report date: the
// export is read across time zones and a bare wall-clock time would lie.
const REPORT_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

const REPORT_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const REPORT_VALUE_LABELS: Record<string, string> = {
  active: "Active",
  approved: "Approved",
  absence: "Scheduled absence",
  inactive: EMPLOYMENT_STATUS_LABELS.inactive,
  // Historical key from the old enum — kept so reports against archived data
  // still render with the current label.
  benched: EMPLOYMENT_STATUS_LABELS.inactive,
  calloff: "Call-off",
  cancelled: "Canceled",
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
  removed: EMPLOYMENT_STATUS_LABELS.removed,
  // Historical key from the old enum — kept so reports against archived data
  // still render with the current label.
  terminated: EMPLOYMENT_STATUS_LABELS.removed,
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

function formatListValue(value: string | null | undefined, emptyLabel: string): string {
  return value?.trim() ? value : emptyLabel;
}

function formatContactValue(value: string, emptyLabel: string): string {
  return value.trim() ? value : emptyLabel;
}

function formatEmployeeIdValue(value: number | null): string {
  return value == null ? "-" : `#${value}`;
}

function formatAccountLinked(value: boolean): string {
  return value ? "Linked" : "Not linked";
}

function formatInvitationStatus(value: string): string {
  return value.trim() ? `Pending invitation (${value})` : "No pending invitation";
}

function formatMissingCertification(value: boolean, certification: string): string {
  return value ? `Missing ${certification}` : `${capitalizeFirst(certification)} recorded`;
}

function formatMissingRole(value: boolean, role: string): string {
  return value ? `Missing ${role}` : `${capitalizeFirst(role)} assigned`;
}

/** The organization's own terms, in the forms report headings and cells need. */
function reportTerms(payload: OperationsReportPayload) {
  const labels = payload.labels ?? {
    focusArea: "Focus Areas",
    certification: "Certifications",
    role: "Roles",
  };
  return {
    focusArea: singularLabelNoun(labels.focusArea),
    focusAreas: pluralLabelNoun(labels.focusArea),
    certification: singularLabelNoun(labels.certification),
    certifications: pluralLabelNoun(labels.certification),
    role: singularLabelNoun(labels.role),
    roles: pluralLabelNoun(labels.role),
  };
}

function formatReportTimestampForDisplay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return REPORT_TIMESTAMP_FORMATTER.format(date);
}

function formatNoticeHours(value: number | null): string {
  if (value == null) return "-";
  if (value < 0) return `${formatReportNumber(Math.abs(value))} hours after start`;
  return `${formatReportNumber(value)} ${value === 1 ? "hour" : "hours"} before`;
}

function formatResolutionHours(value: number | null): string {
  if (value == null) return "Not resolved";
  return `${formatReportNumber(value)} ${value === 1 ? "hour" : "hours"}`;
}

export function buildOperationsReportPreviewTable(
  payload: OperationsReportPayload,
  report: OperationsReportType,
): OperationsReportPreviewTable {
  const terms = reportTerms(payload);
  switch (report) {
    case "employee-directory":
      return {
        title: "Employee directory",
        columns: [
          { label: "Employee ID" },
          { label: "Employee" },
          { label: "Staff status" },
          { label: "Employment type" },
          { label: "Email" },
          { label: "Phone" },
          { label: capitalizeFirst(terms.focusAreas) },
          { label: capitalizeFirst(terms.roles) },
          { label: capitalizeFirst(terms.certification) },
          { label: "Departments" },
        ],
        rows: payload.reports.employeeDirectory.map((row) => [
          formatEmployeeIdValue(row.employeeNumber),
          row.employeeName,
          formatKnownReportValue(row.status),
          formatKnownReportValue(row.employmentType),
          formatContactValue(row.email, "No email"),
          formatContactValue(row.phone, "No phone"),
          formatListValue(row.focusAreas, `No ${terms.focusAreas}`),
          formatListValue(row.roles, "No roles"),
          formatListValue(row.certification, `No ${terms.certification}`),
          formatListValue(row.departments, "No departments"),
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
          { label: "Shift breakdown" },
          { label: "Job breakdown" },
          { label: "Schedule notes" },
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
            formatListValue(row.shiftBreakdown, "No categorized shifts"),
            formatListValue(row.jobBreakdown, "No jobs"),
            formatListValue(row.indicatorBreakdown, "No schedule notes"),
            row.absenceCount,
            row.overtimeHours,
          ]),
        emptyText: "No published schedule for this range.",
      };
    case "staff-activity":
      return {
        title: "Staff activity",
        columns: [
          { label: "Staff member" },
          { label: "Scheduled hours" },
          { label: "Shift assignments" },
          { label: "Work days" },
          { label: "Shift breakdown" },
          { label: "Job breakdown" },
          { label: "Schedule notes" },
          { label: "Published absences" },
          { label: "Unscheduled days" },
          { label: "Approved impact" },
          { label: "All request activity" },
          { label: "Request breakdown" },
        ],
        rows: payload.reports.staffActivity.summaries.map((row) => [
          row.employeeName,
          row.scheduledHours,
          row.shiftCount,
          row.workedDays,
          formatListValue(row.shiftBreakdown, "No categorized shifts"),
          formatListValue(row.jobBreakdown, "No jobs"),
          formatListValue(row.indicatorBreakdown, "No schedule notes"),
          row.publishedAbsenceDays,
          row.unscheduledDays,
          row.approvedImpactCount,
          row.allRequestCount,
          formatListValue(row.requestBreakdown, "No request activity"),
        ]),
        emptyText: "No staff activity for this range.",
      };
    case "mentoring-hours":
      return {
        title: "Mentoring hours",
        columns: [
          { label: "Staff member" },
          { label: "Mentoring hours" },
          { label: "Mentored assignments" },
          { label: "Mentored days" },
        ],
        rows: payload.reports.mentoringHours.map((row) => [
          row.employeeName,
          row.mentoringHours,
          row.mentoredAssignmentCount,
          row.mentoredDays,
        ]),
        emptyText: "No published mentored assignments for this range.",
      };
    case "mentoring-detail":
      return {
        title: "Mentoring detail",
        columns: [
          { label: "Staff member" },
          { label: "Date" },
          { label: capitalizeFirst(terms.focusArea) },
          { label: "Shift" },
          { label: "Job" },
          { label: "Start time" },
          { label: "End time" },
          { label: "Mentoring hours" },
        ],
        rows: payload.reports.mentoringDetail.map((row) => [
          row.employeeName,
          formatReportDateForDisplay(row.date),
          row.focusArea,
          row.shift,
          row.job,
          formatListValue(row.startTime, "Not set"),
          formatListValue(row.endTime, "Not set"),
          row.mentoringHours,
        ]),
        emptyText: "No published mentored assignments for this range.",
      };
    case "coverage":
      return {
        title: "Coverage",
        columns: [
          { label: "Date" },
          { label: capitalizeFirst(terms.focusArea) },
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
          ["Coverage", summary.coveragePct == null ? "Not available" : `${summary.coveragePct}%`],
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
          { label: "Requester" },
          { label: "Requester's shift date" },
          { label: "Requester's shift" },
          { label: "Requester's job" },
          { label: `Requester's ${terms.focusArea}` },
          { label: "Requester's time" },
          { label: "Teammate" },
          { label: "Teammate's shift date" },
          { label: "Teammate's shift" },
          { label: "Teammate's job" },
          { label: `Teammate's ${terms.focusArea}` },
          { label: "Teammate's time" },
          { label: "Absence type" },
          { label: "Submitted" },
          { label: "Decided" },
          { label: "Decided by" },
          { label: "Time to resolution" },
          { label: "Manager note" },
        ],
        rows: payload.reports.shiftRequests.map((row) => [
          formatKnownReportValue(row.type),
          formatKnownReportValue(row.status),
          row.requester,
          formatReportDateForDisplay(row.requesterShiftDate),
          formatListValue(row.requesterShift, "-"),
          formatListValue(row.requesterJobs, "-"),
          formatListValue(row.requesterFocusArea, "-"),
          formatListValue(row.requesterTime, "-"),
          formatListValue(row.target, "No teammate"),
          row.targetShiftDate ? formatReportDateForDisplay(row.targetShiftDate) : "-",
          formatListValue(row.targetShift, "-"),
          formatListValue(row.targetJobs, "-"),
          formatListValue(row.targetFocusArea, "-"),
          formatListValue(row.targetTime, "-"),
          formatListValue(row.absenceType, "-"),
          formatReportTimestampForDisplay(row.createdAt),
          row.resolvedAt ? formatReportTimestampForDisplay(row.resolvedAt) : "-",
          formatListValue(row.decidedBy, "-"),
          formatResolutionHours(row.resolutionHours),
          formatListValue(row.managerNote, "-"),
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
          { label: "Dropped shift" },
          { label: "Shift time" },
          { label: "Called off at" },
          { label: "Notice given" },
          { label: "Decided" },
          { label: "Decided by" },
          { label: "Manager note" },
        ],
        rows: payload.reports.absencesCalloffs.map((row) => [
          formatKnownReportValue(row.kind),
          row.employeeName,
          formatReportDateForDisplay(row.date),
          formatListValue(row.absenceType, "No absence type"),
          formatKnownReportValue(row.status),
          formatListValue(row.droppedShift, "-"),
          formatListValue(row.droppedShiftTime, "-"),
          row.submittedAt ? formatReportTimestampForDisplay(row.submittedAt) : "-",
          formatNoticeHours(row.noticeHours),
          row.decidedAt ? formatReportTimestampForDisplay(row.decidedAt) : "-",
          formatListValue(row.decidedBy, "-"),
          formatListValue(row.managerNote, "-"),
        ]),
        emptyText: "No absences or call-offs for this range.",
      };
    case "roster-status":
      return {
        title: "Roster status",
        columns: [
          { label: "Employee ID" },
          { label: "Employee" },
          { label: "Staff status" },
          { label: "Employment type" },
          { label: capitalizeFirst(terms.focusAreas) },
          { label: capitalizeFirst(terms.roles) },
          { label: "Account linked" },
          { label: "Invitation status" },
        ],
        rows: payload.reports.rosterStatus.map((row) => [
          formatEmployeeIdValue(row.employeeNumber),
          row.employeeName,
          formatKnownReportValue(row.status),
          formatKnownReportValue(row.employmentType),
          formatListValue(row.focusAreas, `No ${terms.focusAreas}`),
          formatListValue(row.roles, "No roles"),
          formatAccountLinked(row.linkedAccount),
          formatInvitationStatus(row.pendingInvitation),
        ]),
        emptyText: "No staff records found.",
      };
    case "certification-role-matrix":
      return {
        title: `${capitalizeFirst(terms.certifications)} and ${terms.roles}`,
        columns: [
          { label: "Employee ID" },
          { label: "Employee" },
          { label: "Staff status" },
          { label: capitalizeFirst(terms.certification) },
          { label: capitalizeFirst(terms.roles) },
          { label: capitalizeFirst(terms.focusAreas) },
          { label: "Departments" },
          { label: `${capitalizeFirst(terms.certification)} status` },
          { label: `${capitalizeFirst(terms.role)} status` },
        ],
        rows: payload.reports.certificationRoleMatrix.map((row) => [
          formatEmployeeIdValue(row.employeeNumber),
          row.employeeName,
          formatKnownReportValue(row.status),
          formatListValue(row.certification, `No ${terms.certification}`),
          formatListValue(row.roles, "No roles"),
          formatListValue(row.focusAreas, `No ${terms.focusAreas}`),
          formatListValue(row.departments, "No departments"),
          formatMissingCertification(row.missingCertification, terms.certification),
          formatMissingRole(row.missingRole, terms.role),
        ]),
        emptyText: "No staff records found.",
      };
    case "account-access":
      return {
        title: "Account access",
        columns: [
          { label: "Employee ID" },
          { label: "Employee" },
          { label: "Staff status" },
          { label: "Email" },
          { label: "Account linked" },
          { label: "Invitation status" },
          { label: "Access status" },
        ],
        rows: payload.reports.accountAccess.map((row) => [
          formatEmployeeIdValue(row.employeeNumber),
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
          .filter((row) => payload.reports.scheduleMatrix.dates.some((date) => row.cells[date]))
          .map((row) => [
            row.employeeName,
            ...payload.reports.scheduleMatrix.dates.map((date) => row.cells[date] ?? ""),
          ]),
        emptyText: "No published schedule for this range.",
      };
    case "shift-notes":
      return {
        title: "Schedule notes",
        columns: [
          { label: "Date" },
          { label: "Employee" },
          { label: "Schedule note" },
          { label: capitalizeFirst(terms.focusArea) },
        ],
        rows: payload.reports.shiftNotes.map((row) => [
          formatReportDateForDisplay(row.date),
          row.employeeName,
          row.indicator,
          formatListValue(row.focusArea, `No ${terms.focusArea}`),
        ]),
        emptyText: "No published schedule notes for this range.",
      };
  }
}

export function buildOperationsReportMetrics(
  payload: OperationsReportPayload,
  report: OperationsReportType,
): ReportMetric[] {
  const summary = payload.reports.shiftPeriodSummary;
  const terms = reportTerms(payload);

  switch (report) {
    case "employee-directory":
      return [
        { label: "Staff records", value: String(payload.reports.employeeDirectory.length) },
        {
          label: "Active staff",
          value: String(
            payload.reports.employeeDirectory.filter((row) => row.status === "active").length,
          ),
        },
      ];
    case "staff-hours":
      return [
        { label: "Scheduled hours", value: String(summary.totalScheduledHours) },
        { label: "Shifts", value: String(summary.totalShifts) },
        { label: "Overtime alerts", value: String(summary.overtimeAlertCount) },
      ];
    case "staff-activity": {
      const summaries = payload.reports.staffActivity.summaries;
      return [
        { label: "Staff", value: String(summaries.length) },
        {
          label: "Scheduled hours",
          value: String(summaries.reduce((sum, row) => sum + row.scheduledHours, 0)),
        },
        {
          label: "Approved impact",
          value: String(summaries.reduce((sum, row) => sum + row.approvedImpactCount, 0)),
        },
        {
          label: "All request activity",
          value: String(summaries.reduce((sum, row) => sum + row.allRequestCount, 0)),
        },
      ];
    }
    case "mentoring-hours":
    case "mentoring-detail": {
      const totalMentoringHours = payload.reports.mentoringHours.reduce(
        (sum, row) => sum + row.mentoringHours,
        0,
      );
      const mentoredAssignmentCount = payload.reports.mentoringDetail.length;
      return [
        { label: "Mentoring hours", value: String(totalMentoringHours) },
        { label: "Staff mentored", value: String(payload.reports.mentoringHours.length) },
        { label: "Mentored assignments", value: String(mentoredAssignmentCount) },
      ];
    }
    case "coverage":
      return [
        {
          label: "Coverage",
          value: summary.coveragePct == null ? "Not available" : `${summary.coveragePct}%`,
        },
        { label: "Open slots", value: String(summary.openSlotCount) },
      ];
    case "shift-period-summary":
      return [
        { label: "Scheduled hours", value: String(summary.totalScheduledHours) },
        { label: "Shifts", value: String(summary.totalShifts) },
        {
          label: "Coverage",
          value: summary.coveragePct == null ? "Not available" : `${summary.coveragePct}%`,
        },
        { label: "Open slots", value: String(summary.openSlotCount) },
        { label: "Requests", value: String(summary.requestCount) },
        { label: "Overtime alerts", value: String(summary.overtimeAlertCount) },
      ];
    case "shift-requests": {
      const rows = payload.reports.shiftRequests;
      const count = (predicate: (row: (typeof rows)[number]) => boolean) =>
        String(rows.filter(predicate).length);
      const decided = rows.filter((row) => row.resolutionHours != null);
      const averageHours =
        decided.length === 0
          ? null
          : decided.reduce((total, row) => total + (row.resolutionHours ?? 0), 0) / decided.length;
      return [
        { label: "Requests", value: String(rows.length) },
        { label: "Approved", value: count((row) => row.status === "approved") },
        { label: "Rejected", value: count((row) => row.status === "rejected") },
        {
          label: "Canceled or expired",
          value: count((row) => row.status === "cancelled" || row.status === "expired"),
        },
        {
          label: "Still open",
          value: count((row) => row.status === "open" || row.status === "pending_approval"),
        },
        { label: "Pickups", value: count((row) => row.type === "pickup") },
        { label: "Swaps", value: count((row) => row.type === "swap") },
        { label: "Call-offs", value: count((row) => row.type === "calloff") },
        {
          label: "Average time to resolution",
          value:
            averageHours == null ? "-" : formatResolutionHours(Math.round(averageHours * 10) / 10),
        },
      ];
    }
    case "absences-calloffs": {
      const rows = payload.reports.absencesCalloffs;
      const calloffs = rows.filter((row) => row.kind === "calloff");
      const noticed = calloffs.filter((row) => row.noticeHours != null);
      const averageNotice =
        noticed.length === 0
          ? null
          : noticed.reduce((total, row) => total + (row.noticeHours ?? 0), 0) / noticed.length;
      return [
        { label: "Published absences", value: String(rows.length - calloffs.length) },
        { label: "Call-offs", value: String(calloffs.length) },
        {
          label: "Call-offs approved",
          value: String(calloffs.filter((row) => row.status === "approved").length),
        },
        {
          label: "Called off under 24h before",
          value: String(noticed.filter((row) => (row.noticeHours ?? 0) < 24).length),
        },
        {
          label: "Average notice",
          value:
            averageNotice == null ? "-" : formatNoticeHours(Math.round(averageNotice * 10) / 10),
        },
      ];
    }
    case "roster-status":
      return [
        { label: "Staff records", value: String(payload.reports.rosterStatus.length) },
        {
          label: "Pending invitations",
          value: String(payload.reports.rosterStatus.filter((row) => row.pendingInvitation).length),
        },
      ];
    case "certification-role-matrix":
      return [
        {
          label: `Missing ${terms.certifications}`,
          value: String(
            payload.reports.certificationRoleMatrix.filter((row) => row.missingCertification)
              .length,
          ),
        },
        {
          label: `Missing ${terms.roles}`,
          value: String(
            payload.reports.certificationRoleMatrix.filter((row) => row.missingRole).length,
          ),
        },
      ];
    case "account-access":
      return [
        {
          label: "Unlinked staff",
          value: String(payload.reports.accountAccess.filter((row) => !row.linkedAccount).length),
        },
        {
          label: "Pending invitations",
          value: String(
            payload.reports.accountAccess.filter((row) => row.pendingInvitation).length,
          ),
        },
      ];
    case "schedule-matrix":
      return [
        { label: "Scheduled staff", value: String(summary.scheduledStaffCount) },
        { label: "Schedule dates", value: String(payload.reports.scheduleMatrix.dates.length) },
      ];
    case "shift-notes": {
      const notes = payload.reports.shiftNotes;
      return [
        { label: "Schedule notes", value: String(notes.length) },
        {
          label: "Staff tagged",
          value: String(new Set(notes.map((row) => row.employeeId)).size),
        },
        {
          label: "Schedule note types used",
          value: String(new Set(notes.map((row) => row.indicator)).size),
        },
      ];
    }
  }
}
