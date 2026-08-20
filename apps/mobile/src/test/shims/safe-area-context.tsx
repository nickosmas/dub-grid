import type { ReactNode } from "react";

// react-native-safe-area-context re-exports untranspiled react-native Flow
// syntax that vitest can't parse, and there are no real insets under jsdom.
// Zero insets keep layout math deterministic; tests that care about a specific
// inset still mock this module directly (see Screen.test.tsx).
const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 } as const;
const ZERO_FRAME = { x: 0, y: 0, width: 0, height: 0 } as const;

export function useSafeAreaInsets() {
  return ZERO_INSETS;
}

export function useSafeAreaFrame() {
  return ZERO_FRAME;
}

export function SafeAreaProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function SafeAreaView({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export const initialWindowMetrics = { insets: ZERO_INSETS, frame: ZERO_FRAME };
