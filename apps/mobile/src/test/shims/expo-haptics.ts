// Test shim for expo-haptics — the real package eagerly imports expo-modules-core
// + a native binding, which vitest can't resolve/run in jsdom. Haptics are
// fire-and-forget side effects, so no-ops are sufficient for tests.
export const ImpactFeedbackStyle = {
  Light: "light",
  Medium: "medium",
  Heavy: "heavy",
} as const;

export const NotificationFeedbackType = {
  Success: "success",
  Warning: "warning",
  Error: "error",
} as const;

export async function selectionAsync(): Promise<void> {}
export async function impactAsync(): Promise<void> {}
export async function notificationAsync(): Promise<void> {}
