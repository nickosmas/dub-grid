import { NotFoundBoundary } from "@/components/RouteBoundary";

export default function GridmasterNotFound() {
  return (
    <NotFoundBoundary
      title="Page not found"
      message="The Gridmaster page you're looking for doesn't exist."
      backHref="/gridmaster"
      backLabel="Back to Gridmaster"
    />
  );
}
