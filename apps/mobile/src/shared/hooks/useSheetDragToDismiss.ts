import { useCallback, useEffect, useMemo, useRef, type ComponentType, type RefObject } from "react";
import { Gesture } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// Every bottom sheet in the app draws a grabber, so it has to actually drag:
// the sheet follows the finger downward and either snaps back or closes on
// release. Built on gesture-handler rather than PanResponder because the
// sheets are full of Pressables and a ScrollView, and those win the JS
// responder negotiation often enough to make a PanResponder drag misfire.

/** Downward travel before the drag takes over from a tap or a scroll. */
const DRAG_ACTIVATION_DISTANCE = 8;
/** Drag past this, or flick faster than the velocity below (px/s), and it closes. */
const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 800;
const OPEN_TIMING = { duration: 260 } as const;
const SETTLE_TIMING = { duration: 180 } as const;
const DISMISS_TIMING = { duration: 180 } as const;

/** A long drag or a quick flick closes the sheet; anything shorter snaps back. */
export function shouldDismissAfterSheetDrag(translation: number, velocity: number): boolean {
  "worklet";
  return translation > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY;
}

export function useSheetDragToDismiss({
  visible,
  travel,
  enabled = true,
  scrollable = false,
  onDismiss,
}: {
  visible: boolean;
  /** Distance the sheet is translated by when closed — the window height. */
  travel: number;
  enabled?: boolean;
  /** Whether the sheet's body scrolls, which the drag has to yield to. */
  scrollable?: boolean;
  onDismiss: () => void;
}) {
  const translateY = useSharedValue(travel);
  // Where the sheet's own drag started, so a drag that begins as a scroll and
  // then hits the top of the list doesn't jump by the distance already scrolled.
  const dragOrigin = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  // `onDismiss` is an inline arrow at nearly every call site; runOnJS needs a
  // stable target, and rebuilding the gesture mid-drag would drop the drag.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);
  const dismiss = useCallback(() => {
    dismissRef.current();
  }, []);

  useEffect(() => {
    translateY.value = withTiming(visible ? 0 : travel, OPEN_TIMING);
  }, [translateY, travel, visible]);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollOffset.value = event.contentOffset.y;
  });

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(enabled)
      // Downward only: an upward drag fails immediately so it stays a scroll.
      .activeOffsetY(DRAG_ACTIVATION_DISTANCE)
      .failOffsetY(-DRAG_ACTIVATION_DISTANCE)
      .onUpdate((event) => {
        "worklet";
        if (scrollOffset.value > 0) {
          // The list still has room to scroll, so the drag belongs to it. Keep
          // rebasing, so the sheet starts from zero once the list hits the top.
          dragOrigin.value = event.translationY;
          return;
        }

        translateY.value = Math.max(event.translationY - dragOrigin.value, 0);
      })
      .onEnd((event) => {
        "worklet";
        if (translateY.value <= 0) {
          // The gesture never moved the sheet (it was all scrolling).
          return;
        }

        if (!shouldDismissAfterSheetDrag(event.translationY - dragOrigin.value, event.velocityY)) {
          translateY.value = withTiming(0, SETTLE_TIMING);
          return;
        }

        translateY.value = withTiming(travel, DISMISS_TIMING, (finished) => {
          if (finished) {
            runOnJS(dismiss)();
          }
        });
      })
      .onFinalize(() => {
        "worklet";
        dragOrigin.value = 0;
      });

    // Both can run at once: the list scrolls while it has room, and the pan
    // takes over the moment it doesn't. The cast is gesture-handler's ref type
    // insisting on `undefined` where React refs hold `null`.
    return scrollable
      ? pan.simultaneousWithExternalGesture(scrollRef as unknown as RefObject<ComponentType>)
      : pan;
  }, [dismiss, dragOrigin, enabled, scrollOffset, scrollRef, scrollable, translateY, travel]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, Math.max(travel, 1)], [1, 0], Extrapolation.CLAMP),
  }));

  return { backdropStyle, gesture, scrollHandler, scrollRef, sheetStyle };
}
