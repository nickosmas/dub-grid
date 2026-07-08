import { Linking } from "react-native";
import { router } from "expo-router";

const IN_APP_ROUTES: Array<{ prefix: string; route: string }> = [
  { prefix: "/people", route: "/(tabs)/people" },
  { prefix: "/requests", route: "/(tabs)/requests" },
  { prefix: "/schedule", route: "/(tabs)/home" },
  { prefix: "/profile", route: "/(tabs)/profile" },
];

function isExternalUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * Whether tapping this href can actually be completed in the mobile app
 * (an external URL, or one of the known in-app routes). Screens use this to
 * decide whether to render an actionable CTA or a "complete on web" hint.
 */
export function isNotificationActionSupportedOnMobile(href: string): boolean {
  return isExternalUrl(href) || IN_APP_ROUTES.some(({ prefix }) => href.startsWith(prefix));
}

export function openNotificationAction(href: string) {
  if (isExternalUrl(href)) {
    void Linking.openURL(href);
    return;
  }

  const match = IN_APP_ROUTES.find(({ prefix }) => href.startsWith(prefix));
  if (match) {
    router.push(match.route as Parameters<typeof router.push>[0]);
  }
}
