import { NotFoundBoundary } from "@/components/RouteBoundary";

export default function ScheduleNotFound() {
  return (
    <NotFoundBoundary
      title="Schedule not found"
      message="The schedule you're looking for doesn't exist."
      backHref="/schedule"
      backLabel="Back to Schedule"
    />
  );
}
