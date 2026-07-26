// Mirrors the DB's own uniqueness rules (supabase/migrations/001_schema.sql:
// unique_active_employee_email_per_org, unique_active_employee_phone_per_org,
// employees_org_name_active_unique) so client-side checks stay honest about
// what will actually happen on insert. Name normalization is deliberately a
// little more conservative than the raw DB index (which is case/whitespace
// sensitive) since "John Doe" and "john doe" are the same real person.

export interface ExistingEmployeeLite {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export type DuplicateStatus = "blocked" | "warning" | "ok";
export type DuplicateReason = "name" | "email" | "phone" | "similar_name";

export interface DuplicateMatch {
  employee: ExistingEmployeeLite;
  reason: DuplicateReason;
}

export interface RowDuplicateClassification {
  status: DuplicateStatus;
  match: DuplicateMatch | null;
}

interface DuplicateCheckRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

// Starting points, not derived from any established convention — tune if
// real-world imports produce too many/too few similar-name warnings.
const SIMILAR_NAME_MAX_DISTANCE = 2;
const SIMILAR_NAME_MIN_LENGTH = 4;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]+/g, "");
}

export function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// Used only for the similar-name (fuzzy) check, where a holistic full-name
// comparison is appropriate for a soft warning. The exact-match check below
// compares first/last as a tuple instead — concatenating here would let two
// genuinely different people (e.g. first="Anna", last="Marie Lopez" vs.
// first="Anna Marie", last="Lopez") collide into the same string and get
// hard-blocked, even though the DB's own constraint is on the separate
// columns and would never conflate them.
export function normalizeFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim().toLowerCase().replace(/\s+/g, " ");
}

// Relative to name length instead of a flat constant — an absolute distance
// of 2 is a reasonable typo tolerance for a long name but far too loose for
// a short one (e.g. "Bo Wu" vs "Bo Li" are distance 2 apart, a 40% difference
// on a 5-character name, not a plausible typo). Floored at 1, capped at
// SIMILAR_NAME_MAX_DISTANCE so very long names don't get an unreasonably
// loose threshold either.
function similarNameThreshold(length: number): number {
  return Math.max(1, Math.min(SIMILAR_NAME_MAX_DISTANCE, Math.round(length * 0.2)));
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow.push(
        Math.min(
          prevRow[j] + 1, // deletion
          currentRow[j - 1] + 1, // insertion
          prevRow[j - 1] + cost, // substitution
        ),
      );
    }
    prevRow = currentRow;
  }

  return prevRow[b.length];
}

export function findExactDuplicate(
  row: DuplicateCheckRow,
  existing: ExistingEmployeeLite[],
): DuplicateMatch | null {
  const rowFirst = normalizeName(row.firstName);
  const rowLast = normalizeName(row.lastName);
  const rowEmail = normalizeEmail(row.email);
  const rowPhone = normalizePhone(row.phone);

  for (const employee of existing) {
    if (
      rowFirst === normalizeName(employee.firstName) &&
      rowLast === normalizeName(employee.lastName)
    ) {
      return { employee, reason: "name" };
    }
  }

  if (rowEmail) {
    for (const employee of existing) {
      if (employee.email && rowEmail === normalizeEmail(employee.email)) {
        return { employee, reason: "email" };
      }
    }
  }

  if (rowPhone) {
    for (const employee of existing) {
      if (employee.phone && rowPhone === normalizePhone(employee.phone)) {
        return { employee, reason: "phone" };
      }
    }
  }

  return null;
}

// Only meaningful once findExactDuplicate has returned null — a distance of
// 0 is already an exact match, so this only ever surfaces near-misses.
export function findSimilarDuplicate(
  row: Pick<DuplicateCheckRow, "firstName" | "lastName">,
  existing: ExistingEmployeeLite[],
): DuplicateMatch | null {
  const rowName = normalizeFullName(row.firstName, row.lastName);
  if (rowName.length < SIMILAR_NAME_MIN_LENGTH) return null;
  let closest: { employee: ExistingEmployeeLite; distance: number } | null = null;

  for (const employee of existing) {
    const existingName = normalizeFullName(employee.firstName, employee.lastName);
    if (existingName.length < SIMILAR_NAME_MIN_LENGTH) continue;

    const distance = levenshteinDistance(rowName, existingName);
    const threshold = similarNameThreshold(Math.max(rowName.length, existingName.length));
    if (distance > 0 && distance <= threshold) {
      if (!closest || distance < closest.distance) {
        closest = { employee, distance };
      }
    }
  }

  return closest ? { employee: closest.employee, reason: "similar_name" } : null;
}

export function classifyRowAgainstExisting(
  row: DuplicateCheckRow,
  existing: ExistingEmployeeLite[],
): RowDuplicateClassification {
  const exact = findExactDuplicate(row, existing);
  if (exact) return { status: "blocked", match: exact };

  const similar = findSimilarDuplicate(row, existing);
  if (similar) return { status: "warning", match: similar };

  return { status: "ok", match: null };
}
