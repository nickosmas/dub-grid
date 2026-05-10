"use client";

import type {
  OperationsReportFilters,
  OperationsReportPayload,
  OperationsReportRange,
  OperationsReportType,
} from "@/features/reports/server/operations";
import { formatClientErrorMessage } from "@/lib/client-facing";

export const REPORT_OPTIONS: Array<{
  value: OperationsReportType;
  label: string;
}> = [
  { value: "employee-directory", label: "Employee directory" },
  { value: "staff-hours", label: "Staff hours" },
  { value: "coverage", label: "Coverage" },
  { value: "shift-period-summary", label: "Period summary" },
  { value: "shift-requests", label: "Shift requests" },
  { value: "absences-calloffs", label: "Absences and call-offs" },
  { value: "roster-status", label: "Roster status" },
  { value: "certification-role-matrix", label: "Certifications and roles" },
  { value: "account-access", label: "Account access" },
  { value: "schedule-matrix", label: "Schedule matrix" },
];

export type OperationsReportExportFormat = "csv" | "pdf";

function buildReportParams(input: {
  orgId: string;
  range: OperationsReportRange;
  report?: OperationsReportType;
  format?: OperationsReportExportFormat;
  filters?: OperationsReportFilters;
}): URLSearchParams {
  const params = new URLSearchParams({
    orgId: input.orgId,
    startDate: input.range.startDate,
    endDate: input.range.endDate,
  });
  if (input.report) {
    params.set("report", input.report);
  }
  if (input.format) {
    params.set("format", input.format);
  }
  if (input.filters?.employeeIds?.length) {
    params.set("employeeIds", input.filters.employeeIds.join(","));
  }
  if (input.filters?.focusAreaIds?.length) {
    params.set("focusAreaIds", input.filters.focusAreaIds.join(","));
  }
  if (input.filters?.dates?.length) {
    params.set("dates", input.filters.dates.join(","));
  }
  return params;
}

async function parseReportError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return formatClientErrorMessage(
      body.error,
      "We couldn't complete the report request.",
    );
  } catch {
    return "We couldn't complete the report request.";
  }
}

export async function fetchOperationsReport(input: {
  orgId: string;
  range: OperationsReportRange;
  filters?: OperationsReportFilters;
}): Promise<OperationsReportPayload> {
  const response = await fetch(
    `/api/reports/operations?${buildReportParams(input)}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(await parseReportError(response));
  }
  return (await response.json()) as OperationsReportPayload;
}

function getFilename(response: Response, fallback: string): string {
  const header = response.headers.get("content-disposition");
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

async function exportOperationsReportFile(input: {
  orgId: string;
  range: OperationsReportRange;
  report: OperationsReportType;
  format: OperationsReportExportFormat;
  filters?: OperationsReportFilters;
}): Promise<void> {
  const response = await fetch(
    `/api/reports/operations/export?${buildReportParams(input)}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(await parseReportError(response));
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getFilename(
    response,
    `reports-${input.report}-${input.range.startDate}-${input.range.endDate}.${input.format}`,
  );
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportOperationsReportCsv(input: {
  orgId: string;
  range: OperationsReportRange;
  report: OperationsReportType;
  filters?: OperationsReportFilters;
}): Promise<void> {
  return exportOperationsReportFile({ ...input, format: "csv" });
}

export async function exportOperationsReportPdf(input: {
  orgId: string;
  range: OperationsReportRange;
  report: OperationsReportType;
  filters?: OperationsReportFilters;
}): Promise<void> {
  return exportOperationsReportFile({ ...input, format: "pdf" });
}
