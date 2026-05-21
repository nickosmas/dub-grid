import { Linking } from "react-native";
import { router } from "expo-router";

export function openNotificationAction(href: string) {
  if (/^https?:\/\//i.test(href)) {
    void Linking.openURL(href);
    return;
  }
  if (href.startsWith("/requests") || href.startsWith("/people")) {
    router.push("/(tabs)/requests");
  } else if (href.startsWith("/schedule")) {
    router.push("/(tabs)/home");
  } else if (href.startsWith("/profile")) {
    router.push("/(tabs)/profile");
  }
}
