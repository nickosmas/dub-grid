import { joinAbsenceBesideShifts } from "@dubgrid/schedule-core";
import type { ClockRange } from "@/components/absence-span";
interface ExportEmployee {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function formatDateHeader(date: Date): string {
  const day = SHORT_DAYS[date.getDay()];
  const month = date.getMonth() + 1;
  const dayOfMonth = date.getDate();
  return `${day} ${month}/${dayOfMonth}`;
}

function formatEmployeeName(emp: ExportEmployee): string {
  const first = emp.firstName?.trim() ?? "";
  const last = emp.lastName?.trim() ?? "";
  if (last && first) return `${last}, ${first}`;
  return last || first || "Unknown";
}

function escapeCSVField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * A cell's text with its absence beside the shifts (items 45 and 50), as
 * "Day / Sick 11:00 AM - 3:00 PM", or the absence first when they arrived
 * late; unchanged without one.
 */
export function withRestOfDayAbsence(
  text: string,
  absenceLabel: string | undefined,
  span: { absence: ClockRange | null; work: ClockRange | null } = { absence: null, work: null },
): string {
  return absenceLabel ? joinAbsenceBesideShifts(text, absenceLabel, span.absence, span.work) : text;
}

/**
 * Exports the schedule as a CSV file. Rows = employees, columns = dates.
 * Each cell contains the shift code label(s) or absence type label.
 */
export function exportScheduleCSV(
  employees: ExportEmployee[],
  dates: Date[],
  shiftForKey: (empId: string, date: Date) => string | null,
  filename?: string,
): void {
  const headerRow = ["Employee", ...dates.map(formatDateHeader)].map(escapeCSVField);

  const dataRows = employees.map((emp) => {
    const name = formatEmployeeName(emp);
    const cells = dates.map((date) => shiftForKey(emp.id, date) ?? "");
    return [name, ...cells].map(escapeCSVField);
  });

  const csvContent = [headerRow, ...dataRows].map((row) => row.join(",")).join("\r\n");

  downloadCsvFile(csvContent, filename ?? `schedule-${new Date().toISOString().slice(0, 10)}.csv`);
}

/** Hands the browser a CSV file to save. */
export function downloadCsvFile(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
