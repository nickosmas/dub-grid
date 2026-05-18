import type { EmployeeRow } from "./types";

const EMAIL_RE = /[^\s,]+@[^\s,]+\.[^\s,]+/;
const PHONE_RE = /(?:\+?1[\s.\-)]*)?\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}/;

function splitFields(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((f) => f.trim()).filter(Boolean);
  }
  if (line.includes(",")) {
    return line.split(",").map((f) => f.trim()).filter(Boolean);
  }
  return line.split(/\s{2,}/).map((f) => f.trim()).filter(Boolean);
}

function extractAndStrip(fields: string[], pattern: RegExp): { match: string; rest: string[] } {
  for (let i = 0; i < fields.length; i += 1) {
    const m = fields[i].match(pattern);
    if (!m) continue;
    const matched = m[0];
    const before = fields[i].slice(0, m.index ?? 0).trim();
    const after = fields[i].slice((m.index ?? 0) + matched.length).trim();
    const replacement = [before, after].filter(Boolean);
    const rest = [...fields.slice(0, i), ...replacement, ...fields.slice(i + 1)];
    return { match: matched, rest };
  }
  return { match: "", rest: fields };
}

function splitNameTokens(remaining: string[]): { firstName: string; lastName: string } {
  if (remaining.length === 0) return { firstName: "", lastName: "" };
  if (remaining.length === 1) {
    const tokens = remaining[0].split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return { firstName: "", lastName: "" };
    if (tokens.length === 1) return { firstName: tokens[0], lastName: "" };
    return { firstName: tokens[0], lastName: tokens.slice(1).join(" ") };
  }
  if (remaining.length >= 2) {
    return { firstName: remaining[0], lastName: remaining.slice(1).join(" ") };
  }
  return { firstName: "", lastName: "" };
}

export interface ParsedEmployee {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export function parseEmployeePaste(input: string): ParsedEmployee[] {
  const lines = input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: ParsedEmployee[] = [];

  for (const line of lines) {
    const fields = splitFields(line);
    if (fields.length === 0) continue;

    const emailExtract = extractAndStrip(fields, EMAIL_RE);
    const phoneExtract = extractAndStrip(emailExtract.rest, PHONE_RE);
    const { firstName, lastName } = splitNameTokens(phoneExtract.rest);

    if (!firstName && !emailExtract.match && !phoneExtract.match) continue;

    rows.push({
      firstName,
      lastName,
      email: emailExtract.match,
      phone: phoneExtract.match,
    });
  }

  return rows;
}

export function toEmployeeRows(parsed: ParsedEmployee[]): EmployeeRow[] {
  return parsed.map((p) => ({
    id: crypto.randomUUID(),
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    phone: p.phone,
  }));
}
