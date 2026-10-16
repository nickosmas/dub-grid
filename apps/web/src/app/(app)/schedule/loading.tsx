import { ScheduleLoadingScreen } from "./ScheduleLoadingScreen";

// Route-level Suspense fallback fired during a navigation to /schedule. It
// renders the same Shuffle as SchedulePageClient's data-loading state, so the
// wait reads as one continuous load.
export default function ScheduleLoading() {
  return <ScheduleLoadingScreen />;
}
