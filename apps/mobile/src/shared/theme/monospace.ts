import { Platform } from "react-native";

/**
 * A fixed-width face for codes. "monospace" is an Android alias with no iOS
 * equivalent, where codes would silently render in the system font.
 */
export const mobileMonospaceFamily = Platform.OS === "ios" ? "Menlo" : "monospace";
