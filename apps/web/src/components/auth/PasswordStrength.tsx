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

  return (
    <div className={`dg-password-strength dg-password-strength--level-${level}`}>
      {hasStartedTyping ? (
        <div
          className="dg-password-strength__meter"
          role="meter"
          aria-label="Password strength"
          aria-valuenow={level}
          aria-valuemin={0}
          aria-valuemax={3}
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`dg-password-strength__bar${i <= level ? " is-active" : ""}`} />
          ))}
        </div>
      ) : null}
      <span
        id="password-strength-label"
        aria-live="polite"
        className={`dg-password-strength__label${hasStartedTyping ? " is-active" : ""}`}
      >
        {hasStartedTyping ? PASSWORD_STRENGTH_LABELS[level] : "Password requirements"}
      </span>
      <ul
        id="password-strength-hints"
        aria-label="Password strength hints"
        className="dg-password-strength__hints"
      >
        {hints.map((hint) => (
          <li key={hint.id} className={`dg-password-strength__hint${hint.met ? " is-met" : ""}`}>
            <span aria-hidden="true" className="dg-password-strength__hint-dot" />
            <span>{hint.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
