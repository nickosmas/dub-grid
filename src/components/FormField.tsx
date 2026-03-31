"use client";

import type { CSSProperties, ReactNode } from "react";

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "var(--dg-fs-footnote)",
  fontWeight: 600,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 5,
};

const errorStyle: CSSProperties = {
  fontSize: "var(--dg-fs-footnote)",
  color: "var(--color-danger)",
  marginTop: 4,
  display: "flex",
  alignItems: "center",
  gap: 4,
};

/**
 * Lightweight form field wrapper with label and inline error display.
 * No form library dependency — works with plain useState.
 */
export function FormField({
  label,
  error,
  required,
  children,
  style,
}: {
  label?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={style}>
      {label && (
        <label style={labelStyle}>
          {label}
          {required && <span style={{ color: "var(--color-danger)", marginLeft: 2 }}>*</span>}
        </label>
      )}
      {children}
      {error && (
        <div style={errorStyle} role="alert">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email.trim())) return "Invalid email address";
  return null;
}

/**
 * Validates a required text field.
 * Returns error message or null if valid.
 */
export function validateRequired(value: string, label: string): string | null {
  if (!value.trim()) return `${label} is required`;
  return null;
}

/**
 * Validates a phone number (loose — allows various formats).
 */
export function validatePhone(phone: string): string | null {
  if (!phone.trim()) return null;
  const cleaned = phone.replace(/[\s\-().+]/g, "");
  if (cleaned.length > 0 && (cleaned.length < 7 || !/^\d+$/.test(cleaned))) {
    return "Invalid phone number";
  }
  return null;
}
