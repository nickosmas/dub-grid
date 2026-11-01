import { Platform } from "react-native";

/**
 * Whether lists draw in the platform's own form: iOS's grouped list (a bare
 * checkmark, full-width rows, uppercase section headers) or Material 3's
 * (radio buttons and checkboxes, brand-coloured headers). The web build and
 * the tests keep the drawn form.
 */
export const IS_IOS_LIST = Platform.OS === "ios";
export const IS_ANDROID_LIST = Platform.OS === "android";
export const IS_NATIVE_LIST = IS_IOS_LIST || IS_ANDROID_LIST;
