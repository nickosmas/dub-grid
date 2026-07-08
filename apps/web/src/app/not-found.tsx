import { NotFoundBoundary } from "@/components/RouteBoundary";

export default function NotFound() {
  return (
    <NotFoundBoundary
      title="404"
      message="This page could not be found."
      backHref="/"
      backLabel="Go Home"
    />
  );
}
