import { useRef } from "react";
import type { GestureResponderEvent } from "react-native";

const TOAST_SWIPE_DISMISS_THRESHOLD = 32;

type TouchPoint = { x: number; y: number };

function getTouchPoint(event: GestureResponderEvent): TouchPoint | null {
  const nativeEvent = event.nativeEvent;
  const webNativeEvent = nativeEvent as typeof nativeEvent & {
    changedTouches?: Array<{ pageX?: number; pageY?: number }>;
    touches?: Array<{ pageX?: number; pageY?: number }>;
  };

  if (typeof nativeEvent.pageY === "number") {
    return { x: nativeEvent.pageX ?? 0, y: nativeEvent.pageY };
  }

  const touch = webNativeEvent.changedTouches?.[0] ?? webNativeEvent.touches?.[0];
  if (typeof touch?.pageY === "number") {
    return { x: touch.pageX ?? 0, y: touch.pageY };
  }

  return null;
}

/**
 * Touch handlers that dismiss a toast when it is swiped away: up, off the top
 * edge, for a toast at the top; down or sideways for Material's snackbar at the
 * bottom.
 */
export function useToastSwipe(onDismiss: () => void, edge: "top" | "bottom") {
  const startRef = useRef<TouchPoint | null>(null);

  return {
    onTouchStart(event: GestureResponderEvent) {
      startRef.current = getTouchPoint(event);
    },
    onTouchCancel() {
      startRef.current = null;
    },
    onTouchEnd(event: GestureResponderEvent) {
      const start = startRef.current;
      startRef.current = null;
      const end = start ? getTouchPoint(event) : null;
      if (!start || !end) return;

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const isSwipedAway =
        edge === "top"
          ? dy <= -TOAST_SWIPE_DISMISS_THRESHOLD
          : dy >= TOAST_SWIPE_DISMISS_THRESHOLD || Math.abs(dx) >= TOAST_SWIPE_DISMISS_THRESHOLD;
      if (isSwipedAway) onDismiss();
    },
  };
}
