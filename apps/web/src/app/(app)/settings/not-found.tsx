import { NotFoundBoundary } from "@/components/RouteBoundary";

export default function SettingsNotFound() {
  return (
    <NotFoundBoundary
      title="Settings page not found"
      message="The link may be old or mistyped."
      backHref="/settings"
      backLabel="Back to settings"
    />
  );
}
