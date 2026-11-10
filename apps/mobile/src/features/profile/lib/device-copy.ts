import { Platform, Share } from "react-native";

/** What unlocks the app on this phone, in its own words. */
export const APP_LOCK_DESCRIPTION =
  Platform.OS === "ios"
    ? "Ask for Face ID, Touch ID, or your passcode whenever you come back to the app."
    : "Ask for your fingerprint, face, or screen lock whenever you come back to the app.";

/** Apple Calendar's subscribe link opens only on iOS. */
export const CAN_OPEN_APPLE_CALENDAR = Platform.OS === "ios";

/** Shares a link: iOS shares the URL, Android's share sheet needs it as text. */
export async function shareLink(url: string): Promise<void> {
  await Share.share({ url, message: Platform.OS === "android" ? url : undefined });
}
