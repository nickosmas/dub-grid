import { Platform } from "react-native";

/**
 * How a drag dismisses the keyboard: iOS follows the finger, Android's
 * keyboard can't, so it hides as the drag starts.
 */
export const KEYBOARD_DISMISS_MODE = Platform.OS === "ios" ? "interactive" : "on-drag";
