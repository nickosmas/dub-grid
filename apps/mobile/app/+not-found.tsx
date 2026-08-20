import { router, Stack } from "expo-router";
import { RouteErrorScreen } from "../src/shared/components/RouteErrorScreen";

/**
 * Without this, an unknown or stale deep link (an old push payload, a link from
 * a previous app version) falls through to Expo Router's built-in "Unmatched
 * Route" screen, which reads as a developer error in a shipped build.
 */
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RouteErrorScreen
        actionLabel="Go to Home"
        body="That link doesn't point anywhere in the app. It may have expired or been moved."
        iconName="compass-outline"
        onAction={() => {
          router.replace("/");
        }}
        title="We couldn't find that page"
      />
    </>
  );
}
