import { BrandLoadingScreen } from "@/components/BrandLoadingScreen";

/**
 * Full-screen branded loading state for the schedule grid. Shared by the
 * route-level Suspense fallback (`loading.tsx`) and the client-side data
 * loading states in `SchedulePageClient`, so a navigation into the schedule
 * keeps one Shuffle running from fallback to data with no flash between them.
 * Most schedules load faster than the reveal delay, so the logo never shows.
 */
export function ScheduleLoadingScreen() {
  return <BrandLoadingScreen animation="shuffle" label="Loading schedule" data-schedule-loading />;
}
