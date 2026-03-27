"use client";

export function PasswordStrength({ password }: { password: string }) {
  const level =
    password.length < 10
      ? 0
      : password.length < 12
        ? 1
        : /[A-Z]/.test(password) &&
            /[0-9]/.test(password) &&
            /[^A-Za-z0-9]/.test(password)
          ? 3
          : /[A-Z]/.test(password) && /[0-9]/.test(password)
            ? 2
            : 1;

  const labels = ["Too short", "Weak", "Fair", "Strong"];
  const colors = [
    "var(--color-danger)",
    "var(--color-warning)",
    "var(--color-warning)",
    "var(--color-success)",
  ];

  return (
    <div style={{ marginTop: 8 }}>
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
              background:
                i <= level
                  ? colors[level]
                  : "var(--color-border-light)",
              transition: "background 150ms ease",
            }}
          />
        ))}
      </div>
      <span
        id="password-strength-label"
        aria-live="polite"
        style={{
          fontSize: "var(--dg-fs-caption)",
          color: colors[level],
          fontWeight: 500,
        }}
      >
        {labels[level]}
      </span>
    </div>
  );
}
