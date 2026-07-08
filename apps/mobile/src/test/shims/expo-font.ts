// Test shim for expo-font — fonts are pre-loaded no-ops in jsdom (avoids the
// real package's expo-asset / native font-loading chain).
export async function loadAsync(): Promise<void> {}
export function isLoaded(): boolean {
  return true;
}
export function useFonts(): [boolean, Error | null] {
  return [true, null];
}
export default { loadAsync, isLoaded, useFonts };
