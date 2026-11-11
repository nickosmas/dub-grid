import {
  getOptionalStaffEmailError,
  getOptionalUsPhoneError,
  getStaffNameError,
  getStaffNotesError,
  normalizeOptionalStaffEmail,
  normalizeOptionalUsPhone,
} from "@dubgrid/contracts";
import {
  capitalizeFirst,
  isValidFirstDay,
  pluralLabelNoun,
  singularLabelNoun,
} from "@dubgrid/domain";
import {
  classifyRowAgainstExisting,
  type DuplicateMatch,
  type ExistingEmployeeLite,
} from "@/lib/employee-duplicate-detection";

export const STAFF_IMPORT_MAX_ROWS = 500;
export const STAFF_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

/** One row of the file as typed, before any checks. */
export interface StaffImportRow {
  /** The row's position among the file's data rows, from 1. */
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  focusAreaNames: string;
  certificationName: string;
  roleNames: string;
  employment: string;
  firstDay: string;
  contactNotes: string;
}

export interface StaffImportLabels {
  focusArea: string;
  certification: string;
  role: string;
}

interface NamedRef {
  id: number;
  name: string;
}

export interface StaffImportReferences {
  focusAreas: readonly NamedRef[];
  certifications: readonly (NamedRef & { abbr?: string | null })[];
  roles: readonly NamedRef[];
}

/** A row ready to save, its names resolved to ids and its values normalized. */
export interface ResolvedStaffImportRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  focusAreaIds: number[];
  certificationId: number | null;
  roleIds: number[];
  employmentType: "full_time" | "part_time";
  firstDay: string | null;
  contactNotes: string;
}

/** Why a row won't be added, or what to check before adding it. */
export interface StaffImportIssue {
  title: string;
  detail: string;
}

export type StaffImportRowCheck =
  | { row: StaffImportRow; status: "ready"; note: string | null; resolved: ResolvedStaffImportRow }
  | {
      row: StaffImportRow;
      status: "similar";
      issue: StaffImportIssue;
      resolved: ResolvedStaffImportRow;
    }
  | { row: StaffImportRow; status: "blocked"; issues: StaffImportIssue[] };

type Field = Exclude<keyof StaffImportRow, "rowNumber">;

const FIXED_HEADER_ALIASES: Record<string, Field> = {
  first_name: "firstName",
  firstname: "firstName",
  first: "firstName",
  last_name: "lastName",
  lastname: "lastName",
  last: "lastName",
  surname: "lastName",
  email: "email",
  email_address: "email",
  phone: "phone",
  phone_number: "phone",
  mobile: "phone",
  focus_areas: "focusAreaNames",
  focus_area: "focusAreaNames",
  schedule_areas: "focusAreaNames",
  schedule_area: "focusAreaNames",
  certification: "certificationName",
  certifications: "certificationName",
  roles: "roleNames",
  role: "roleNames",
  employment: "employment",
  employment_type: "employment",
  first_day: "firstDay",
  start_date: "firstDay",
  notes: "contactNotes",
  contact_notes: "contactNotes",
};

function normalizeHeader(value: string): string {
  return value
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function headerAliases(labels: StaffImportLabels): Record<string, Field> {
  const aliases: Record<string, Field> = { ...FIXED_HEADER_ALIASES };
  const fromLabel = (label: string, field: Field) => {
    aliases[normalizeHeader(label)] = field;
    aliases[normalizeHeader(singularLabelNoun(label))] = field;
  };
  fromLabel(labels.focusArea, "focusAreaNames");
  fromLabel(labels.certification, "certificationName");
  fromLabel(labels.role, "roleNames");
  return aliases;
}

/** Splits CSV text into records, honouring quoted commas, quotes and line breaks. */
export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  const source = text.replace(/^﻿/, "");

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

export function isCsvFileName(name: string): boolean {
  return /\.csv$/i.test(name.trim());
}

export type ParseStaffCsvResult =
  { ok: true; rows: StaffImportRow[] } | { ok: false; error: string };

/** Reads a staff file: the header row names the columns, in any order. */
export function parseStaffCsv(text: string, labels: StaffImportLabels): ParseStaffCsvResult {
  const records = parseCsvRecords(text);
  const headerIndex = records.findIndex((record) => record.some((cell) => cell.trim()));
  if (headerIndex < 0) {
    return { ok: false, error: "This file is empty." };
  }

  const aliases = headerAliases(labels);
  const columns = new Map<Field, number>();
  records[headerIndex].forEach((cell, index) => {
    const field = aliases[normalizeHeader(cell)];
    if (field && !columns.has(field)) columns.set(field, index);
  });

  const missing = [
    columns.has("firstName") ? null : "first name",
    columns.has("lastName") ? null : "last name",
    columns.has("focusAreaNames") ? null : pluralLabelNoun(labels.focusArea),
  ].filter((name): name is string => name !== null);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `This file has no column for ${joinNames(missing)}. Start from the template, or name the columns the way it does.`,
    };
  }

  const rows: StaffImportRow[] = [];
  records.slice(headerIndex + 1).forEach((record, index) => {
    if (!record.some((cell) => cell.trim())) return;
    const cell = (field: Field) => {
      const column = columns.get(field);
      return column === undefined ? "" : unguardCell((record[column] ?? "").trim());
    };
    rows.push({
      rowNumber: index + 1,
      firstName: cell("firstName"),
      lastName: cell("lastName"),
      email: cell("email"),
      phone: cell("phone"),
      focusAreaNames: cell("focusAreaNames"),
      certificationName: cell("certificationName"),
      roleNames: cell("roleNames"),
      employment: cell("employment"),
      firstDay: cell("firstDay"),
      contactNotes: cell("contactNotes"),
    });
  });

  if (rows.length === 0) {
    return { ok: false, error: "This file has a header row but no people under it." };
  }
  if (rows.length > STAFF_IMPORT_MAX_ROWS) {
    return {
      ok: false,
      error: `This file has ${rows.length} people. Import up to ${STAFF_IMPORT_MAX_ROWS} at a time.`,
    };
  }
  return { ok: true, rows };
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/**
 * A spreadsheet runs a cell that starts with one of these as a formula, so a
 * file we write prefixes it with an apostrophe and reading one back drops it.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell: formula-safe, and quoted when it holds a comma, quote or line break. */
export function staffCsvField(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function unguardCell(value: string): string {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

/**
 * CSV text a spreadsheet opens cleanly: a byte-order mark so accented names
 * survive Excel, and CRLF line endings.
 */
export function toStaffCsv(
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  return `﻿${rows.map((row) => row.map(staffCsvField).join(",")).join("\r\n")}\r\n`;
}

/**
 * The columns a staff file is read and written with, in the organization's own
 * words. The People export writes these first, so an export imports again.
 */
export function staffCsvHeaders(labels: StaffImportLabels): string[] {
  return [
    "First Name",
    "Last Name",
    "Email",
    "Phone",
    labels.focusArea,
    capitalizeFirst(singularLabelNoun(labels.certification)),
    labels.role,
    "Employment",
    "First Day",
    "Notes",
  ];
}

export const EMPLOYMENT_CSV_LABELS = { full_time: "Full-time", part_time: "Part-time" } as const;

/** A starting file: every column, and two example people using the organization's own names. */
export function buildStaffImportTemplate(
  labels: StaffImportLabels,
  references: StaffImportReferences,
): string {
  const headers = staffCsvHeaders(labels);
  const area = (index: number) =>
    references.focusAreas[index % Math.max(references.focusAreas.length, 1)]?.name ?? "";
  const certification = references.certifications[0]?.name ?? "";
  const role = references.roles[0]?.name ?? "";
  const rows = [
    [
      "Jordan",
      "Lee",
      "jordan.lee@example.com",
      "(555) 201-0100",
      area(0),
      certification,
      role,
      "Full-time",
      "",
      "",
    ],
    ["Sam", "Rivera", "", "", area(1), "", "", "Part-time", "", ""],
  ];
  return toStaffCsv([headers, ...rows]);
}

function splitNames(value: string): string[] {
  return value
    .split(";")
    .map((name) => name.trim())
    .filter(Boolean);
}

function findByName<T extends NamedRef>(items: readonly T[], name: string): T | undefined {
  const key = name.toLowerCase();
  return items.find((item) => item.name.toLowerCase() === key);
}

function parseEmployment(value: string): "full_time" | "part_time" | null {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (key === "" || key === "fulltime" || key === "ft") return "full_time";
  if (key === "parttime" || key === "pt") return "part_time";
  return null;
}

/** A first day as YYYY-MM-DD, from that form or a spreadsheet's M/D/YYYY; null when unreadable. */
export function parseImportDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const parts = iso ? [iso[1], iso[2], iso[3]] : us ? [us[3], us[1], us[2]] : null;
  if (!parts) return null;
  const date = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date;
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fieldIssues(
  row: StaffImportRow,
  references: StaffImportReferences,
  labels: StaffImportLabels,
  today: string,
): { issues: StaffImportIssue[]; resolved: ResolvedStaffImportRow | null } {
  const issues: StaffImportIssue[] = [];
  const add = (title: string, detail: string) => issues.push({ title, detail });

  const nameError =
    getStaffNameError(row.firstName, "First name") ?? getStaffNameError(row.lastName, "Last name");
  if (nameError) add("Check the name", `${nameError}.`);
  const emailError = getOptionalStaffEmailError(row.email);
  if (emailError) add("Check the email", `${emailError}.`);
  const phoneError = getOptionalUsPhoneError(row.phone);
  if (phoneError) add("Check the phone", `${phoneError}.`);
  const notesError = getStaffNotesError(row.contactNotes);
  if (notesError) add("Check the notes", `${notesError}.`);

  const areaNoun = singularLabelNoun(labels.focusArea);
  const areaNames = splitNames(row.focusAreaNames);
  const focusAreaIds: number[] = [];
  if (areaNames.length === 0) {
    add(`No ${areaNoun}`, `Each person needs at least one ${areaNoun}.`);
  }
  for (const name of areaNames) {
    const area = findByName(references.focusAreas, name);
    if (area) {
      if (!focusAreaIds.includes(area.id)) focusAreaIds.push(area.id);
    } else {
      add(`Unknown ${areaNoun}`, `No ${areaNoun} is called ${name}.`);
    }
  }

  let certificationId: number | null = null;
  if (row.certificationName) {
    const key = row.certificationName.toLowerCase();
    const certification = references.certifications.find(
      (item) => item.name.toLowerCase() === key || (item.abbr ?? "").toLowerCase() === key,
    );
    const certNoun = singularLabelNoun(labels.certification);
    if (certification) certificationId = certification.id;
    else add(`Unknown ${certNoun}`, `No ${certNoun} is called ${row.certificationName}.`);
  }

  const roleIds: number[] = [];
  const roleNoun = singularLabelNoun(labels.role);
  for (const name of splitNames(row.roleNames)) {
    const role = findByName(references.roles, name);
    if (role) {
      if (!roleIds.includes(role.id)) roleIds.push(role.id);
    } else {
      add(`Unknown ${roleNoun}`, `No ${roleNoun} is called ${name}.`);
    }
  }

  const employmentType = parseEmployment(row.employment);
  if (!employmentType) {
    add("Check the employment", "Employment is Full-time or Part-time.");
  }

  let firstDay: string | null = null;
  if (row.firstDay) {
    firstDay = parseImportDate(row.firstDay);
    if (!firstDay) {
      add("Check the first day", "Write the first day as a date, such as 2026-12-01.");
    } else if (!isValidFirstDay(firstDay, today)) {
      add(
        firstDay < today ? "First day has passed" : "First day too far ahead",
        `A first day can be from today up to a year ahead, not ${formatDay(firstDay)}.`,
      );
    }
  }

  if (issues.length > 0 || !employmentType) return { issues, resolved: null };
  return {
    issues,
    resolved: {
      firstName: row.firstName.trim().replace(/\s+/g, " "),
      lastName: row.lastName.trim().replace(/\s+/g, " "),
      email: normalizeOptionalStaffEmail(row.email),
      phone: normalizeOptionalUsPhone(row.phone),
      focusAreaIds,
      certificationId,
      roleIds,
      employmentType,
      firstDay,
      contactNotes: row.contactNotes.trim(),
    },
  };
}

function personName(employee: ExistingEmployeeLite): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

function duplicateIssue(match: DuplicateMatch, earlierRow: number | null): StaffImportIssue {
  const name = personName(match.employee);
  if (earlierRow !== null) {
    return {
      title: `Same person as row ${earlierRow}`,
      detail: `Same person as row ${earlierRow}.`,
    };
  }
  const what =
    match.reason === "email" ? "this email" : match.reason === "phone" ? "this phone" : "this name";
  return { title: "Already on staff", detail: `Already on staff: ${name} has ${what}.` };
}

/**
 * Checks every row against the organization's names, the shared staff rules,
 * everyone already on staff in any status, and the rows above it. A row
 * repeated in the file is kept the first time and refused after that.
 */
export function checkStaffImportRows(
  rows: readonly StaffImportRow[],
  context: StaffImportReferences & {
    labels: StaffImportLabels;
    existing: readonly ExistingEmployeeLite[];
    today: string;
  },
): StaffImportRowCheck[] {
  const existing = [...context.existing];
  return rows.map((row, index) => {
    const { issues, resolved } = fieldIssues(row, context, context.labels, context.today);
    const earlier: ExistingEmployeeLite[] = rows.slice(0, index).map((other) => ({
      id: String(other.rowNumber),
      firstName: other.firstName,
      lastName: other.lastName,
      email: other.email,
      phone: other.phone,
    }));

    const onStaff = classifyRowAgainstExisting(row, existing);
    const inFile = classifyRowAgainstExisting(row, earlier);
    if (onStaff.status === "blocked" && onStaff.match) {
      issues.unshift(duplicateIssue(onStaff.match, null));
    } else if (inFile.status === "blocked" && inFile.match) {
      issues.unshift(duplicateIssue(inFile.match, Number(inFile.match.employee.id)));
    }

    if (issues.length > 0 || !resolved) {
      return { row, status: "blocked", issues };
    }

    const similar =
      onStaff.status === "warning" && onStaff.match
        ? `Similar to ${personName(onStaff.match.employee)} on staff. Check it isn't the same person.`
        : inFile.status === "warning" && inFile.match
          ? `Similar to row ${inFile.match.employee.id}. Check it isn't the same person.`
          : null;
    if (similar) {
      return {
        row,
        status: "similar",
        issue: { title: "Ready, but check", detail: similar },
        resolved,
      };
    }
    return {
      row,
      status: "ready",
      note: resolved.email ? null : "No email, so no invite.",
      resolved,
    };
  });
}

/** The reason a refused row gives on its own, as one sentence. */
export function staffImportReason(issues: readonly StaffImportIssue[]): string {
  return issues.map((issue) => issue.detail).join(" ");
}
