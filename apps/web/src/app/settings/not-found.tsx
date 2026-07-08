import { NotFoundBoundary } from "@/components/RouteBoundary";

export default function SettingsNotFound() {
  return (
    <NotFoundBoundary
      title="Settings page not found"
      message="The settings page you're looking for doesn't exist."
      backHref="/settings"
      backLabel="Back to Settings"
    />
  );
}
