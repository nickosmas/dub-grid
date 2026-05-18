export const DEPARTMENT_CONFLICT_CODE = "DEPARTMENT_CONFLICT";

export interface DepartmentConflict {
  code: typeof DEPARTMENT_CONFLICT_CODE;
  error: string;
  message: string;
  /** Duplicate name extracted from the Postgres error details, if found. */
  name: string | null;
}

/**
 * Translates a Postgres unique_violation (23505) on departments into a
 * structured 409-compatible conflict object so the UI can surface a
 * friendly message instead of "Settings request failed".
 *
 * Returns null when the error isn't a known duplicate-name case.
 */
export function getDepartmentConflict(
  error: unknown,
): DepartmentConflict | null {
  if (!error || typeof error !== "object") return null;

  const record = error as {
    code?: unknown;
    constraint?: unknown;
    details?: unknown;
    message?: unknown;
  };
  if (record.code !== "23505") return null;

  const text = [record.constraint, record.details, record.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  // The active-name constraint catches duplicates of non-archived rows
  // within the same org.
  if (
    !text.includes("departments_org_name_active_unique") &&
    !text.includes("departments_name_unique") &&
    !text.includes("departments_org_name")
  ) {
    return null;
  }

  // Pull the offending name out of "Key (org_id, name)=(uuid, Foo)" if we
  // can. The fallback is a generic message.
  const match = /=\([^,]+,\s*([^)]+)\)/.exec(
    typeof record.details === "string" ? record.details : "",
  );
  const name = match ? match[1].trim() : null;

  const message = name
    ? `A department named "${name}" already exists. Pick a different name.`
    : "A department with that name already exists. Pick a different name.";

  return {
    code: DEPARTMENT_CONFLICT_CODE,
    error: message,
    message,
    name,
  };
}
