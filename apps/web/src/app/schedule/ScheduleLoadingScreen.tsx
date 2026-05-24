import { AnimatedDubGridLogo } from "@/components/Logo";

/**
 * Full-screen branded loading state for the schedule grid. Shared by the
 * route-level Suspense fallback (`loading.tsx`) and the client-side data
 * loading states in `SchedulePageClient` so the logo renders at one identical
 * size across both. Rendering it at different sizes used to make the logo
 * flash small (the 48px Suspense fallback) before jumping to big (the 160px
 * client state).
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
      <AnimatedDubGridLogo size={160} />
    </div>
  );
}
