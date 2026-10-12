import { AnimatedDubGridLogo } from "@/components/AnimatedDubGridLogo";
import { DelayedReveal } from "@/components/DelayedReveal";

/**
 * Full-screen branded loading state for the schedule grid. Shared by the
 * route-level Suspense fallback (`loading.tsx`) and the client-side data
 * loading states in `SchedulePageClient` so both render the same logo at
 * the same canonical brand size (no flash between fallback and client).
 */
export function ScheduleLoadingScreen() {
  return (
    <div
      data-schedule-loading
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--dg-color-bg)",
        zIndex: 50,
      }}
    >
      {/* Most schedules load faster than this, so the logo never shows. */}
      <DelayedReveal afterMs={400}>
        <AnimatedDubGridLogo animation="shuffle" />
      </DelayedReveal>
    </div>
  );
}
