"use client";

const VALID_SLUG_CHARS = /^[a-z0-9-]*$/;

/**
 * Organization subdomain entry used on the apex login screen. Shows the
 * `.baseDomain` suffix inline. Unlike the old field, it does not silently
 * strip invalid characters as you type — it surfaces a hint instead and
 * leaves normalization to the caller's submit handler.
 */
export function SubdomainField({
  value,
  onChange,
  baseDomain,
  error,
  autoFocus,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  baseDomain: string;
  error?: string | null;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const hasInvalidChars = !VALID_SLUG_CHARS.test(value.toLowerCase());
  const hint = error ?? (hasInvalidChars ? "Use letters, numbers, and hyphens only." : null);
  const showError = Boolean(error) || hasInvalidChars;

  return (
    <div
      className={hint ? "dg-subdomain-field dg-subdomain-field--has-hint" : "dg-subdomain-field"}
    >
      <div
        className={`dg-subdomain-field__control${showError ? " dg-subdomain-field__control--error" : ""}`}
      >
        <input
          id="organization-subdomain"
          type="text"
          autoFocus={autoFocus}
          disabled={disabled}
          className="dg-standalone-input dg-subdomain-field__input"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s/g, ""))}
          placeholder="yourorg"
          aria-label="Organization subdomain"
          aria-invalid={showError}
          aria-describedby={hint ? "organization-subdomain-hint" : undefined}
        />
        <span className="dg-subdomain-field__suffix">.{baseDomain}</span>
      </div>
      {hint && (
        <p
          id="organization-subdomain-hint"
          className={`dg-subdomain-field__hint${showError ? " dg-subdomain-field__hint--error" : ""}`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
