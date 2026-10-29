import { NotFoundBoundary } from "@/components/RouteBoundary";

export default function PeopleNotFound() {
  return (
    <NotFoundBoundary
      title="Person not found"
      message="The link may be old or mistyped."
      backHref="/people"
      backLabel="Back to people"
    />
  );
}
