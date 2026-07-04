import ProgressBar from "@/components/ProgressBar";

// Route-level Suspense fallback fired during a navigation TO /schedule.
// Matches every other authed route's loading.tsx — a top progress bar, no
// full-screen overlay, no dubgrid mark. The animating mark is reserved for
// SchedulePageClient's data-loading state on the schedule page itself.
export default function ScheduleLoading() {
  return <ProgressBar loading />;
}
