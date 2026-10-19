import type { ReactNode } from "react";
import type { BrandAnimation } from "@dubgrid/design-tokens";
import { AnimatedDubGridLogo } from "@/components/AnimatedDubGridLogo";
import { DelayedReveal } from "@/components/DelayedReveal";

/**
 * A full-screen wait with nothing else to show: the page background, then the
 * animated mark once the wait outlasts `revealAfterMs`, so quick waits never
 * flash it.
 */
export function BrandLoadingScreen({
  animation,
  revealAfterMs = 400,
  label = "Loading",
  footer,
  ...dataAttributes
}: {
  animation: BrandAnimation;
  revealAfterMs?: number;
  label?: string;
  /** Shown under the mark, such as a way out of a long wait. */
  footer?: ReactNode;
} & { [key: `data-${string}`]: string | boolean | undefined }) {
  return (
    <div
      {...dataAttributes}
      role="status"
      aria-label={label}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        gap: 24,
        alignItems: "center",
        justifyContent: "center",
        background: "var(--dg-color-bg)",
        zIndex: 50,
      }}
    >
      <DelayedReveal afterMs={revealAfterMs}>
        <AnimatedDubGridLogo animation={animation} />
      </DelayedReveal>
      {footer}
    </div>
  );
}
