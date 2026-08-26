"use client";

import {
  useId,
  type CSSProperties,
  type ReactNode,
  type ReactElement,
  cloneElement,
  isValidElement,
} from "react";
import {
  getRequiredStaffEmailError,
  getOptionalUsPhoneError,
  getStaffNameError,
  getStaffNotesError,
} from "@dubgrid/contracts";

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "var(--dg-fs-footnote)",
  fontWeight: 600,
  color: "var(--dg-color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 5,
};

const errorStyle: CSSProperties = {
  fontSize: "var(--dg-fs-footnote)",
  color: "var(--dg-color-danger)",
  marginTop: 4,
  display: "flex",
  alignItems: "center",
  gap: 4,
};

/**
 * Lightweight form field wrapper with label and inline error display.
 * Generates a stable ID to connect <label> → <input> via htmlFor/id,
 * and error messages via aria-describedby.
 */
export function FormField({
  label,
  error,
  required,
  children,
  style,
  id: externalId,
}: {
  label?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  /** Optional ID override — when omitted a stable ID is generated. */
  id?: string;
}) {
  const generatedId = useId();
  const fieldId = externalId ?? generatedId;
  const errorId = `${fieldId}-error`;

  // Inject id + aria-describedby into the child input element
  const enhancedChildren = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: (children as ReactElement<Record<string, unknown>>).props.id ?? fieldId,
        ...(error ? { "aria-describedby": errorId, "aria-invalid": true } : {}),
        ...(required ? { "aria-required": true } : {}),
      })
    : children;

  return (
    <div style={style}>
      {label && (
        <label htmlFor={fieldId} style={labelStyle}>
          {label}
          {required && <span style={{ color: "var(--dg-color-danger)", marginLeft: 2 }}>*</span>}
        </label>
      )}
      {enhancedChildren}
      {error && (
        <div id={errorId} style={errorStyle} role="alert">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Validates an email address string.
 * Returns error message or null if valid.
 */
export function validateEmail(email: string): string | null {
  if (!email.trim()) return null; // empty is ok for optional fields
  return getRequiredStaffEmailError(email);
}

/**
 * Validates a required text field.
 * Returns error message or null if valid.
 */
export function validateRequired(value: string, label: string): string | null {
  return getStaffNameError(value, label);
}

/**
 * Validates a phone number (loose — allows various formats).
 */
export function validatePhone(phone: string): string | null {
  return getOptionalUsPhoneError(phone);
}

export function validateNotes(notes: string): string | null {
  return getStaffNotesError(notes);
}
