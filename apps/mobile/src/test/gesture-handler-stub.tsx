import * as React from "react";
import { View } from "react-native";

type GestureEvent = Record<string, unknown>;
type GestureHandler = (event: GestureEvent) => void;

type ChainableGesture = {
  __handlers: Partial<Record<string, GestureHandler>>;
} & Record<string, (...args: unknown[]) => ChainableGesture>;

// Methods that register a callback vitest can invoke directly to drive a
// gesture without simulating real touch/pan input (react-native-gesture-handler
// gestures aren't otherwise testable under jsdom).
const GESTURE_HANDLER_METHODS = ["onStart", "onUpdate", "onChange", "onEnd", "onFinalize"];

// Pure config methods — no callback to capture, just chainable no-ops.
const GESTURE_CONFIG_METHODS = [
  "minDistance",
  "activeOffsetX",
  "activeOffsetY",
  "failOffsetX",
  "failOffsetY",
  "enabled",
  "simultaneousWithExternalGesture",
  "requireExternalGestureToFail",
];

// Every Gesture.Pan() built during a test is pushed here so tests can grab
// the instance currently wired to a component (usually `.at(-1)` right
// after render) and call e.g. `.__handlers.onStart?.({})` directly.
export const capturedPanGestures: ChainableGesture[] = [];

function createChainableGesture(): ChainableGesture {
  const gesture = { __handlers: {} } as ChainableGesture;

  for (const method of GESTURE_HANDLER_METHODS) {
    gesture[method] = (handler: unknown) => {
      gesture.__handlers[method] = handler as GestureHandler;
      return gesture;
    };
  }

  for (const method of GESTURE_CONFIG_METHODS) {
    gesture[method] = () => gesture;
  }

  return gesture;
}

function createPanGesture(): ChainableGesture {
  const gesture = createChainableGesture();
  capturedPanGestures.push(gesture);
  return gesture;
}

export const Gesture = {
  Pan: createPanGesture,
  Tap: createChainableGesture,
  LongPress: createChainableGesture,
  Race: createChainableGesture,
  Simultaneous: createChainableGesture,
  Exclusive: createChainableGesture,
};

export function GestureDetector({ children }: { children?: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}

export const GestureHandlerRootView = View;
