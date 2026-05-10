import { z } from "zod";

const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;
const URL_LIKE_PATTERN = /(?:https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,})/i;
const STAFF_NAME_ALLOWED_PATTERN = /^[\p{L}\p{M} .'\-\u2019]+$/u;
const PHONE_ALLOWED_PATTERN = /^[\d\s().+\-]+$/;

export function getStaffNameError(
  value: string,
  label = "Name",
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return `${label} is required`;
  }
  if (trimmed.length > 80) {
    return `${label} must be 80 characters or fewer`;
  }
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    return `${label} contains unsupported characters`;
  }
  if (URL_LIKE_PATTERN.test(trimmed)) {
    return `${label} cannot contain a URL`;
  }
  if (!/\p{L}/u.test(trimmed)) {
    return `${label} must include at least one letter`;
  }
  if (!STAFF_NAME_ALLOWED_PATTERN.test(trimmed)) {
    return `${label} can only include letters, spaces, hyphens, apostrophes, and periods`;
  }
  return null;
}

export function normalizeStaffName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const error = getStaffNameError(trimmed);
  if (error) {
    throw new Error(error);
  }
  return trimmed;
}

export const staffNameSchema = z
  .string()
  .superRefine((value, ctx) => {
    const error = getStaffNameError(value);
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }
  })
  .transform((value) => value.trim().replace(/\s+/g, " "));

export function getStaffNotesError(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length > 1000) {
    return "Notes must be 1000 characters or fewer";
  }
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    return "Notes contain unsupported characters";
  }
  return null;
}

export function normalizeStaffNotes(value: string): string {
  const trimmed = value.trim();
  const error = getStaffNotesError(trimmed);
  if (error) {
    throw new Error(error);
  }
  return trimmed;
}

export const staffNotesSchema = z
  .string()
  .superRefine((value, ctx) => {
    const error = getStaffNotesError(value);
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }
  })
  .transform((value) => value.trim());

export function getRequiredStaffEmailError(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "Email is required";
  }
  const result = z.string().email().safeParse(trimmed);
  if (!result.success) {
    return "Invalid email address";
  }
  return null;
}

export function normalizeRequiredStaffEmail(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const error = getRequiredStaffEmailError(trimmed);
  if (error) {
    throw new Error(error);
  }
  return trimmed;
}

export const requiredStaffEmailSchema = z
  .string()
  .superRefine((value, ctx) => {
    const error = getRequiredStaffEmailError(value);
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }
  })
  .transform((value) => value.trim().toLowerCase());

export function normalizeOptionalStaffEmail(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  const result = z.string().email().safeParse(trimmed);
  if (!result.success) {
    throw new Error("Invalid email address");
  }
  return trimmed;
}

export const optionalStaffEmailSchema = z
  .string()
  .superRefine((value, ctx) => {
    try {
      normalizeOptionalStaffEmail(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          error instanceof Error ? error.message : "Invalid email address",
      });
    }
  })
  .transform((value) => value.trim().toLowerCase());

export function getOptionalUsPhoneError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!PHONE_ALLOWED_PATTERN.test(trimmed)) {
    return "Enter a valid US phone number";
  }
  if (
    (trimmed.match(/\+/g) ?? []).length > 1 ||
    (trimmed.includes("+") && !trimmed.startsWith("+"))
  ) {
    return "Enter a valid US phone number";
  }

  let digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  } else if (digits.length !== 10) {
    return "Enter a 10-digit US phone number";
  }

  const areaCode = digits.slice(0, 3);
  const exchangeCode = digits.slice(3, 6);
  if (/^[01]/.test(areaCode) || /^[01]/.test(exchangeCode)) {
    return "Enter a valid US phone number";
  }

  return null;
}

export function normalizeOptionalUsPhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const error = getOptionalUsPhoneError(trimmed);
  if (error) {
    throw new Error(error);
  }

  let digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export const optionalUsPhoneSchema = z
  .string()
  .superRefine((value, ctx) => {
    const error = getOptionalUsPhoneError(value);
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }
  })
  .transform((value) => normalizeOptionalUsPhone(value));
