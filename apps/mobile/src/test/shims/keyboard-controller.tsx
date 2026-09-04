import * as React from "react";
import { ScrollView, View } from "react-native";

// react-native-keyboard-controller reaches straight for its native module at
// import time, which doesn't exist under jsdom. Everything here resolves to the
// keyboard-closed state, which is the right default: no test drives a real
// keyboard, and a screen's closed layout is the one worth asserting.
//
// Only View and ScrollView are wrapped, matching the constraint documented in
// `reanimated-stub.tsx` — `src/test/native.tsx` is a partial react-native
// emulation and vitest's mock proxy throws on an undefined export, so pulling a
// primitive it doesn't carry would break collection for every dependent file.

const passthroughComponent = (Component: React.ComponentType<any>) =>
  React.forwardRef<unknown, Record<string, unknown>>(function KeyboardPassthrough(props, ref) {
    return React.createElement(Component as never, { ref, ...props });
  });

export const KeyboardProvider = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

export const KeyboardAwareScrollView = passthroughComponent(ScrollView);
export const KeyboardAvoidingView = passthroughComponent(View);
export const KeyboardStickyView = passthroughComponent(View);
export const OverKeyboardView = passthroughComponent(View);
export const KeyboardExtender = passthroughComponent(View);
export const KeyboardToolbar = passthroughComponent(View);
export const KeyboardControllerView = passthroughComponent(View);

/**
 * Matches the real hook's sign convention: `height` is *negative* while the
 * keyboard is up (`heightSV.value = -event.height` in the library), so callers
 * can hand it straight to `translateY`. Zero here means closed either way, but
 * a test that fakes a value has to use the same sign the app's math assumes.
 */
export function useReanimatedKeyboardAnimation() {
  return React.useRef({ height: { value: 0 }, progress: { value: 0 } }).current;
}

export function useKeyboardAnimation() {
  return React.useRef({ height: { value: 0 }, progress: { value: 0 } }).current;
}

export function useKeyboardHandler(_handler: unknown, _deps?: unknown) {
  return undefined;
}

export function useGenericKeyboardHandler(_handler: unknown, _deps?: unknown) {
  return undefined;
}

export function useFocusedInputHandler(_handler: unknown, _deps?: unknown) {
  return undefined;
}

export function useReanimatedFocusedInput() {
  return { input: { value: null } };
}

export function useResizeMode() {
  return undefined;
}

export function useKeyboardController() {
  return { enabled: true, setEnabled: () => {} };
}

export function useKeyboardState() {
  return {
    isVisible: false,
    height: 0,
    duration: 0,
    timestamp: 0,
    target: -1,
    type: "default",
    appearance: "default",
  };
}

export function useKeyboardContext() {
  return {
    enabled: true,
    animated: { height: { value: 0 }, progress: { value: 0 } },
    reanimated: { height: { value: 0 }, progress: { value: 0 } },
    layout: { value: null },
    setKeyboardHandlers: () => () => {},
    setInputHandlers: () => () => {},
    setEnabled: () => {},
  };
}

export const KeyboardController = {
  dismiss: () => Promise.resolve(),
  setInputMode: () => {},
  setDefaultMode: () => {},
  setFocusTo: () => {},
  isVisible: () => false,
  state: () => null,
};

export const KeyboardEvents = {
  addListener: () => ({ remove: () => {} }),
};

export const FocusedInputEvents = {
  addListener: () => ({ remove: () => {} }),
};

export const AndroidSoftInputModes = {
  SOFT_INPUT_ADJUST_NOTHING: 48,
  SOFT_INPUT_ADJUST_PAN: 32,
  SOFT_INPUT_ADJUST_RESIZE: 16,
  SOFT_INPUT_ADJUST_UNSPECIFIED: 0,
} as const;

export const DefaultKeyboardToolbarTheme = {
  dark: {},
  light: {},
} as const;
