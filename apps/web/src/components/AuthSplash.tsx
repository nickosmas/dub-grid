"use client";

import { AnimatedDubGridLogo } from "@/components/Logo";

/**
 * Full-screen branded splash shown during auth navigations (post-login arrival
 * and logout teardown). It masks the blank frame the destination would
 * otherwise paint while the client re-verifies the session, giving a smooth
 * hand-off from the login button spinner to the next screen.
 *
 * Solid background + top z-index so it covers the app shell, header gating, and
 * any modals underneath. Fades in via the shared `fade-in` keyframe.
 */
export default function AuthSplash() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg)",
        animation: "fade-in var(--dg-duration-standard) ease",
      }}
    >
      <AnimatedDubGridLogo size={56} color="var(--color-brand)" />
    </div>
  );
}
