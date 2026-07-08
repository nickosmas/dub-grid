// Vitest stub for @expo-google-fonts/dm-sans. The real package pulls in
// expo-font → expo-modules-core, which can't resolve in the jsdom test
// environment. Tests render the wordmark with the system font; the stub
// just needs `useFonts` to report "loaded" so consumers don't render null.
export const useFonts = (): [boolean, unknown] => [true, null];
export const DMSans_700Bold = "DMSans_700Bold";
