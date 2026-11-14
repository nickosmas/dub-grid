import type { ErrorBoundaryProps } from "expo-router";
import { RouteErrorScreen } from "./RouteErrorScreen";

/**
 * Keeps a crash inside the authed tab tree from unmounting the whole app:
 * the provider tree above stays alive, so "Try again" can actually recover.
 * Every platform's tab layout exports it as its `ErrorBoundary`.
 */
export function TabsErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <RouteErrorScreen
      actionLabel="Try again"
      body="This tab didn't load. Try again."
      detail={error.message}
      onAction={() => {
        void retry();
      }}
      title="This tab ran into a problem"
    />
  );
}
