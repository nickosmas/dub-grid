"use client";

// Rules come from @dubgrid/domain so web and mobile enforce one bar. This file
// used to carry a byte-level duplicate that had already drifted: web gated on
// length alone while mobile required strength level 2.
import {
  PASSWORD_STRENGTH_LABELS,
  getPasswordStrengthHints,
  getPasswordStrengthLevel,
} from "@dubgrid/domain";

export { getPasswordStrengthHints };

export function PasswordStrength({ password }: { password: string }) {
  const hints = getPasswordStrengthHints(password);
  const level = getPasswordStrengthLevel(password);
  const hasStartedTyping = password.length > 0;
  const colors = [
    "var(--color-danger)",
    "var(--color-warning)",
    "var(--color-warning)",
    "var(--color-success)",
  ];

  return (
    <div style={{ marginTop: 8 }}>
      {hasStartedTyping ? (
        <div
          style={{ display: "flex", gap: 4, marginBottom: 4 }}
          role="meter"
          aria-label="Password strength"
          aria-valuenow={level}
          aria-valuemin={0}
          aria-valuemax={3}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: i <= level ? colors[level] : "var(--color-border-light)",
                transition: "background 150ms ease",
              }}
            />
          ))}
        </div>
      ) : null}
      <span
        id="password-strength-label"
        aria-live="polite"
        style={{
          fontSize: "var(--dg-fs-caption)",
          color: hasStartedTyping ? colors[level] : "var(--color-text-muted)",
          fontWeight: 500,
        }}
      >
        {hasStartedTyping ? PASSWORD_STRENGTH_LABELS[level] : "Password requirements"}
      </span>
      <ul
        id="password-strength-hints"
        aria-label="Password strength hints"
        style={{
          display: "grid",
          gap: 4,
          listStyle: "none",
          margin: "8px 0 0",
          padding: 0,
        }}
      >
        {hints.map((hint) => (
          <li
            key={hint.id}
            style={{
              alignItems: "center",
              color: hint.met ? "var(--color-success-text)" : "var(--color-text-muted)",
              display: "flex",
              fontSize: "var(--dg-fs-caption)",
              gap: 6,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                background: hint.met ? "var(--color-success)" : "var(--color-border)",
                borderRadius: 999,
                flex: "0 0 6px",
                height: 6,
                width: 6,
              }}
            />
            <span>{hint.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
