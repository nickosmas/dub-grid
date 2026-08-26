"use client";

import type { ReactNode } from "react";

/**
 * Visually consistent section heading used inside composite wizard steps.
 * Keeps each grouped sub-step (e.g. "Departments" inside StructureStep)
 * visually distinct without re-introducing per-step page chrome.
 */
export default function CompositeSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 16 }}>
        <h3
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "var(--dg-color-text-primary)",
            margin: "0 0 4px",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h3>
        {description && (
          <p
            style={{
              fontSize: 13,
              color: "var(--dg-color-text-muted)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {description}
          </p>
        )}
      </div>
      <div
        style={{
          background: "var(--dg-color-surface)",
          borderRadius: "var(--dg-radius-xl)",
          border: "1px solid var(--dg-color-border)",
          padding: "20px",
        }}
      >
        {children}
      </div>
    </section>
  );
}
