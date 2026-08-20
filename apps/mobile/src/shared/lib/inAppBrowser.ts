import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import type { MobileColors } from "../theme/tokens";

/**
 * Opens a DubGrid web page (policies, billing) in an in-app browser —
 * SFSafariViewController on iOS, a Custom Tab on Android — so reading it never
 * evicts the user from the app. Falls back to handing the URL to the OS if the
 * in-app browser can't open, which is what the whole app used to do.
 *
 * Pass the current `mobileColors` so the chrome matches the active theme; the
 * system default is a light toolbar that looks broken against dark mode.
 */
export async function openInAppBrowser(url: string, mobileColors: MobileColors): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, {
      controlsColor: mobileColors.brand,
      toolbarColor: mobileColors.surface,
      // Android only: keeps the tab on top of the app rather than as a separate
      // recents entry, so Back returns here.
      showTitle: true,
    });
  } catch {
    await Linking.openURL(url).catch(() => {
      // Nothing sensible left to do — the page simply doesn't open.
    });
  }
}
