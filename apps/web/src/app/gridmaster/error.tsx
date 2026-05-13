"use client";

import { ErrorBoundary } from "@/components/RouteBoundary";

export default function GridmasterError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorBoundary error={error} reset={reset} />;
}
