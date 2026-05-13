import { NotFoundBoundary } from "@/components/RouteBoundary";

export default function StaffNotFound() {
  return (
    <NotFoundBoundary
      title="Page not found"
      message="The page you're looking for doesn't exist."
      backHref="/people"
      backLabel="Back to People"
    />
  );
}
