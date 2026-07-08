"use client";

/**
 * Full-screen branded surface shown during the logout teardown — a plain
 * `var(--color-bg)` overlay with no mark. The dubgrid mark (static or
 * animated) is reserved for actual brand chrome (navbar/footer/page-shells)
 * and the schedule route's data-loading state. Rendering it here was being
 * misread as the schedule's pulsing-grid loader.
 */
export default function AuthSplash() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        background: "var(--color-bg)",
      }}
    />
  );
}
