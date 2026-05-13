export type ShiftCategoryConflictField = "name" | "code";

export const SHIFT_CATEGORY_CONFLICT_CODE = "SHIFT_CATEGORY_CONFLICT";

export interface ShiftCategoryConflict {
  code: typeof SHIFT_CATEGORY_CONFLICT_CODE;
  error: string;
  field: ShiftCategoryConflictField;
  message: string;
}

/**
 * Translates a Postgres unique_violation (23505) on the shift_categories
 * partial indexes into a structured 409-compatible conflict object.
 *
 * Returns null for anything that isn't one of the three known constraints,
 * so the caller can fall through to a generic error response.
 *
 * Mirrored client-side by the duplicate checks in
 * components/settings/ShiftCategories.tsx — this helper exists to handle
 * the race-condition path where two clients save before the client check
 * can see the other.
 */
export function getShiftCategoryConflict(
  error: unknown,
): ShiftCategoryConflict | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const record = error as {
    code?: unknown;
    constraint?: unknown;
    details?: unknown;
    message?: unknown;
  };
  if (record.code !== "23505") {
    return null;
  }

  const text = [record.constraint, record.details, record.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  if (text.includes("shift_categories_area_name_unique")) {
    const message = "Another shift in this focus area already uses that name.";
    return {
      code: SHIFT_CATEGORY_CONFLICT_CODE,
      error: message,
      field: "name",
      message,
    };
  }

  if (text.includes("shift_categories_global_name_unique")) {
    const message = "Another shift already uses that name.";
    return {
      code: SHIFT_CATEGORY_CONFLICT_CODE,
      error: message,
      field: "name",
      message,
    };
  }

  if (text.includes("shift_categories_area_code_unique")) {
    const message = "Another shift in this focus area already uses that code.";
    return {
      code: SHIFT_CATEGORY_CONFLICT_CODE,
      error: message,
      field: "code",
      message,
    };
  }

  if (text.includes("shift_categories_global_code_unique")) {
    const message = "Another shift already uses that code.";
    return {
      code: SHIFT_CATEGORY_CONFLICT_CODE,
      error: message,
      field: "code",
      message,
    };
  }

  return null;
}
