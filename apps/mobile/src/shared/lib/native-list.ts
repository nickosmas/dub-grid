import { Platform } from "react-native";

/**
 * Whether lists draw in the phones' grouped form (full-width rows, a bare
 * checkmark, 17pt group headers), the same on iOS and Android. The web build
 * and the tests keep the drawn form.
 */
export const IS_NATIVE_LIST = Platform.OS === "ios" || Platform.OS === "android";
