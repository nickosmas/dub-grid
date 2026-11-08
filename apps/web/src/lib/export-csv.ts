import { joinAbsenceBesideShifts } from "@dubgrid/schedule-core";
import type { ClockRange } from "@/components/absence-span";
interface ExportEmployee {
  id: string;
  firstName: string | null;
  lastName: string | null;
  focusAreaIds?: number[];
}

interface ScheduleCsvOptions {
  /** The org's word for its focus areas, heading a column of each person's. */
  focusAreaColumn?: string;
  focusAreaNameById?: ReadonlyMap<number, string>;
  filename?: string;
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
/** The schedule as CSV text: a row per person, with their focus areas when asked. */
export function buildScheduleCsv(
  employees: ExportEmployee[],
  dates: Date[],
  shiftForKey: (empId: string, date: Date) => string | null,
  options: Omit<ScheduleCsvOptions, "filename"> = {},
): string {
  const { focusAreaColumn, focusAreaNameById } = options;
  const headerRow = [
    "Employee",
    ...(focusAreaColumn ? [focusAreaColumn] : []),
    ...dates.map(formatDateHeader),
  ].map(escapeCSVField);

  const dataRows = employees.map((emp) => {
    const name = formatEmployeeName(emp);
    const areas = (emp.focusAreaIds ?? [])
      .map((id) => focusAreaNameById?.get(id))
      .filter(Boolean)
      .join("; ");
    const cells = dates.map((date) => shiftForKey(emp.id, date) ?? "");
    return [name, ...(focusAreaColumn ? [areas] : []), ...cells].map(escapeCSVField);
  });

  return [headerRow, ...dataRows].map((row) => row.join(",")).join("\r\n");
}

export function exportScheduleCSV(
  employees: ExportEmployee[],
  dates: Date[],
  shiftForKey: (empId: string, date: Date) => string | null,
  options: ScheduleCsvOptions = {},
): void {
  downloadCsvFile(
    buildScheduleCsv(employees, dates, shiftForKey, options),
    options.filename ?? `schedule-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

/** A cell's text naming the focus areas of work outside the person's own, as the grid marks it. */
export function withOtherFocusAreas(text: string, otherFocusAreaNames: string[]): string {
  return otherFocusAreaNames.length > 0 ? `${text} (${otherFocusAreaNames.join(", ")})` : text;
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
