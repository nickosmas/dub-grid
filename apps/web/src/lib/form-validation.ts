import { getOptionalUsPhoneError } from "@dubgrid/contracts";

const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;
const URL_LIKE_PATTERN = /(?:https?:\/\/|www\.)/i;

type TextValidationOptions = {
  label: string;
  maxLength: number;
  required?: boolean;
  disallowUrl?: boolean;
};

type CodeValidationOptions = {
  label: string;
  maxLength: number;
  required?: boolean;
  uppercase?: boolean;
};

export function getLineTextError(
  value: string,
  options: TextValidationOptions,
): string | null {
  const { label, maxLength, required = false, disallowUrl = false } = options;
  const trimmed = value.trim();

  if (!trimmed) {
    return required ? `${label} is required` : null;
  }
  if (trimmed.length > maxLength) {
    return `${label} must be ${maxLength} characters or fewer`;
  }
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    return `${label} contains unsupported characters`;
  }
  if (disallowUrl && URL_LIKE_PATTERN.test(trimmed)) {
    return `${label} cannot contain a URL`;
  }
  return null;
}

export function normalizeLineText(
  value: string,
  options: TextValidationOptions,
): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  const error = getLineTextError(normalized, options);
  if (error) {
    throw new Error(error);
  }
  return normalized;
}

export function getMultilineTextError(
  value: string,
  options: Omit<TextValidationOptions, "disallowUrl">,
): string | null {
  const { label, maxLength, required = false } = options;
  const trimmed = value.trim();

  if (!trimmed) {
    return required ? `${label} is required` : null;
  }
  if (trimmed.length > maxLength) {
    return `${label} must be ${maxLength} characters or fewer`;
  }
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    return `${label} contains unsupported characters`;
  }
  return null;
}

export function normalizeMultilineText(
  value: string,
  options: Omit<TextValidationOptions, "disallowUrl">,
): string {
  const normalized = value.trim();
  const error = getMultilineTextError(normalized, options);
  if (error) {
    throw new Error(error);
  }
  return normalized;
}

export function getOptionalUsPhoneFieldError(value: string): string | null {
  return getOptionalUsPhoneError(value);
}

export function getCodeError(
  value: string,
  options: CodeValidationOptions,
): string | null {
  const {
    label,
    maxLength,
    required = false,
    uppercase = false,
  } = options;
  const normalized = uppercase
    ? value.trim().replace(/\s+/g, " ").toUpperCase()
    : value.trim().replace(/\s+/g, " ");

  return getLineTextError(normalized, {
    label,
    maxLength,
    required,
    disallowUrl: true,
  });
}

export function normalizeCode(
  value: string,
  options: CodeValidationOptions,
): string {
  const {
    uppercase = false,
  } = options;
  const normalized = uppercase
    ? value.trim().replace(/\s+/g, " ").toUpperCase()
    : value.trim().replace(/\s+/g, " ");
  const error = getCodeError(normalized, options);
  if (error) {
    throw new Error(error);
  }
  return normalized;
}
