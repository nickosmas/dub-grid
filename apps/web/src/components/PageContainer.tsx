import type { CSSProperties, ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  /** Maximum content width in px. Default 1200. */
  maxWidth?: number;
  /** Skip the entry animation (e.g. when nested inside another animated container). */
  noAnimation?: boolean;
  /** Extra style overrides for the outer scroller. */
  style?: CSSProperties;
  /** Extra style overrides for the inner content wrapper. */
  contentStyle?: CSSProperties;
}

/**
 * Canonical wrapper for authenticated in-app pages.
 *
 * Provides:
 * - Responsive padding (16 / 24 / 32-40)
 * - Centered content with consistent max-width
 * - Optional entry animation (dg-page-enter)
 *
 * Pages that need a different max-width can override via the prop.
 * Pages that own their full viewport (schedule grid) should not use this.
 */
export function PageContainer({
  children,
  maxWidth = 1200,
  noAnimation,
  style,
  contentStyle,
}: PageContainerProps) {
  return (
    <div
      style={{
        width: "100%",
        padding: "clamp(16px, 3vw, 32px) clamp(16px, 3vw, 40px)",
        display: "flex",
        justifyContent: "center",
        ...style,
      }}
    >
      <div
        className={noAnimation ? undefined : "dg-page-enter"}
        style={{
          width: "100%",
          maxWidth,
          ...contentStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
