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
    <div style={{ marginBottom: hint ? "8px" : "24px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: `1.5px solid ${showError ? "var(--color-danger)" : "var(--color-brand)"}`,
          borderRadius: "var(--dg-radius-md)",
          overflow: "hidden",
          background: "var(--color-surface)",
        }}
      >
        <input
          id="organization-subdomain"
          type="text"
          autoFocus={autoFocus}
          disabled={disabled}
          className="dg-standalone-input"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s/g, ""))}
          placeholder="yourorg"
          aria-label="Organization subdomain"
          aria-invalid={showError}
          aria-describedby={hint ? "organization-subdomain-hint" : undefined}
          style={{
            flex: 1,
            padding: "14px 14px 14px 16px",
            border: "none",
            outline: "none",
            fontSize: "var(--dg-fs-body)",
            color: "var(--color-text-primary)",
            background: "transparent",
            minWidth: 0,
          }}
        />
        <span
          style={{
            padding: "14px 16px",
            fontSize: "var(--dg-fs-body)",
            color: "var(--color-text-subtle)",
            background: "var(--color-bg)",
            borderLeft: "1px solid var(--color-border-light)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          .{baseDomain}
        </span>
      </div>
      {hint && (
        <p
          id="organization-subdomain-hint"
          style={{
            color: showError ? "var(--color-danger)" : "var(--color-text-subtle)",
            fontSize: "var(--dg-fs-label)",
            margin: "8px 0 16px",
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
