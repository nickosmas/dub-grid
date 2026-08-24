import { AnimatedDubGridLogo } from "@/components/AnimatedDubGridLogo";

/**
 * Full-screen branded loading state for the schedule grid. Shared by the
 * route-level Suspense fallback (`loading.tsx`) and the client-side data
 * loading states in `SchedulePageClient` so both render the same logo at
 * the same canonical brand size (no flash between fallback and client).
 */
export function ScheduleLoadingScreen() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg)",
        zIndex: 50,
      }}
    >
      <AnimatedDubGridLogo />
    </div>
  );
}
