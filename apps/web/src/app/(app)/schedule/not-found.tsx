import { NotFoundBoundary } from "@/components/RouteBoundary";

export default function ScheduleNotFound() {
  return (
    <NotFoundBoundary
      title="Schedule not found"
      message="The link may be old or mistyped."
      backHref="/schedule"
      backLabel="Back to schedule"
    />
  );
}
