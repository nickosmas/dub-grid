import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from "react";
import { type LayoutChangeEvent } from "react-native";
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

/**
 * Vertical travel before the drag takes over from a tap or a scroll. A thumb
 * tap on the header routinely slides a few points, and at 8 that slide was
 * enough to start the pan and cancel the tap underneath it.
 */
const DRAG_ACTIVATION_DISTANCE = 12;
/** Horizontal travel that hands the touch back: a sideways slop is not a drag. */
const DRAG_FAIL_DISTANCE = 12;
/** Drag past this, or flick faster than the velocity below (px/s), and it closes. */
const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 800;
const OPEN_TIMING = { duration: 260 } as const;
const SETTLE_TIMING = { duration: 180 } as const;
const DISMISS_TIMING = { duration: 180 } as const;

/**
 * How far the sheet will ever travel in a direction it cannot actually go. The
 * sheet reserves this much surface below the screen edge so an upward drag has
 * something to lift, so the two have to agree.
 */
export const SHEET_OVERDRAG_LIMIT = 32;

/** A long drag or a quick flick closes the sheet; anything shorter snaps back. */
export function shouldDismissAfterSheetDrag(translation: number, velocity: number): boolean {
  "worklet";
  return translation > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY;
}

/**
 * How far the sheet moves when it is dragged somewhere it cannot go: upward,
 * where a sheet already at its ceiling has nothing to reveal, and downward on a
 * sheet that refuses to close. Both have to answer the finger — a grabber that
 * moves nothing reads as a dead surface, and the sheet has no other way to say
 * "not this one" — so it follows against rubber-band resistance and springs
 * back on release.
 *
 * The curve is asymptotic rather than clamped: the first pixels track nearly
 * 1:1, the pull tightens as it goes, and the sheet never passes
 * `SHEET_OVERDRAG_LIMIT` however hard it is dragged. A hard clamp would stop
 * dead mid-drag, which reads as the gesture breaking rather than as resistance.
 */
export function resistSheetOverdrag(distance: number): number {
  "worklet";
  if (distance <= 0) return 0;
  return (SHEET_OVERDRAG_LIMIT * distance) / (distance + SHEET_OVERDRAG_LIMIT);
}

export function useSheetDragToDismiss({
  visible,
  travel,
  dismissible = true,
  scrollable = false,
  onDismiss,
}: {
  visible: boolean;
  /** Distance the sheet is translated by when closed — the window height. */
  travel: number;
  /**
   * Whether a drag can close the sheet. The drag itself is always live: a sheet
   * that says no still moves while it is being dragged (`resistSheetOverdrag`)
   * and settles back, rather than ignoring the gesture outright.
   */
  dismissible?: boolean;
  /** Whether the sheet's body scrolls, which the drag has to yield to. */
  scrollable?: boolean;
  onDismiss: () => void;
}) {
  const translateY = useSharedValue(travel);
  // Read through a shared value rather than the closure so the position effect
  // below doesn't depend on it. `travel` is the window height, and on Android
  // that changes every time the keyboard opens or closes (`adjustResize`), which
  // re-ran the effect *during* a drag dismissal and animated the sheet straight
  // back up — the "sheet refuses to close" bug. Rotation did the same.
  const travelValue = useSharedValue(travel);
  // Whether the sheet is on its way out. The exit animation can be interrupted,
  // and an interrupted animation still has to hand over to `onDismiss` — see the
  // callback below.
  const isDismissing = useSharedValue(false);
  // Where the sheet's own drag started, so a drag that begins as a scroll and
  // then hits the top of the list doesn't jump by the distance already scrolled.
  const dragOrigin = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  // What is left to scroll past the bottom of the list, which is the other end
  // of the same question `scrollOffset` answers at the top: whose drag is this.
  // Measured rather than read off a scroll event so it is known before the first
  // scroll — a sheet whose content never fills it never emits one, and would
  // otherwise be stuck yielding every upward drag to a list that cannot move.
  const scrollViewport = useSharedValue(0);
  const scrollContentHeight = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  // `onDismiss` is an inline arrow at nearly every call site; runOnJS needs a
  // stable target, and rebuilding the gesture mid-drag would drop the drag.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);
  // A drag parks the sheet off-screen before handing over to `onDismiss`, which
  // is free to keep the sheet open (a dirty form asking to discard first). Bump
  // a counter so the position effect below re-runs and re-reads `visible`,
  // rather than leaving the sheet mounted but stranded past the bottom edge.
  const [dragDismissCount, setDragDismissCount] = useState(0);
  const dismiss = useCallback(() => {
    setDragDismissCount((count) => count + 1);
    dismissRef.current();
  }, []);

  useEffect(() => {
    travelValue.value = travel;
  }, [travel, travelValue]);

  useEffect(() => {
    translateY.value = withTiming(visible ? 0 : travelValue.value, OPEN_TIMING);
  }, [dragDismissCount, translateY, travelValue, visible]);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollOffset.value = event.contentOffset.y;
  });

  // Both fire on mount, before anything has been scrolled, and again on every
  // change — a sheet whose body grows (an expanding section, the keyboard
  // shrinking the viewport) hands the upward drag back to the list on its own.
  const onScrollContentSizeChange = useCallback(
    (_width: number, height: number) => {
      scrollContentHeight.value = height;
    },
    [scrollContentHeight],
  );
  const onScrollViewLayout = useCallback(
    (event: LayoutChangeEvent) => {
      scrollViewport.value = event.nativeEvent.layout.height;
    },
    [scrollViewport],
  );

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      // Live in both directions: the sheet answers a drag whichever way it goes,
      // and which of the sheet and the list owns the motion is decided per frame
      // below, by whether the list has anywhere left to go.
      .activeOffsetY([-DRAG_ACTIVATION_DISTANCE, DRAG_ACTIVATION_DISTANCE])
      .failOffsetX([-DRAG_FAIL_DISTANCE, DRAG_FAIL_DISTANCE])
      .onStart(() => {
        "worklet";
        // A finger on the sheet takes it back off the exit animation, so the
        // interrupted-exit handover below must not fire for this one.
        isDismissing.value = false;
      })
      .onUpdate((event) => {
        "worklet";
        const dragged = event.translationY - dragOrigin.value;

        if (dragged < 0) {
          // Upward. The list scrolls while it has content below; past its end
          // the sheet takes over and stretches, since it has nothing to expand
          // into. Rebasing while the list scrolls is what makes the handover
          // continuous instead of a jump.
          if (scrollContentHeight.value - scrollViewport.value - scrollOffset.value > 1) {
            dragOrigin.value = event.translationY;
            return;
          }

          translateY.value = -resistSheetOverdrag(-dragged);
          return;
        }

        if (scrollOffset.value > 0) {
          // Downward, and the list still has room to scroll back up, so the drag
          // belongs to it. Same rebasing, so the sheet starts from zero once the
          // list hits the top.
          dragOrigin.value = event.translationY;
          return;
        }

        translateY.value = dismissible ? dragged : resistSheetOverdrag(dragged);
      })
      .onEnd((event) => {
        "worklet";
        if (translateY.value === 0) {
          // The gesture never moved the sheet (it was all scrolling).
          return;
        }

        // A sheet dragged up, or one that will not close, comes back where it
        // was; only a downward drag on a dismissable sheet can carry it away.
        if (
          translateY.value < 0 ||
          !dismissible ||
          !shouldDismissAfterSheetDrag(event.translationY - dragOrigin.value, event.velocityY)
        ) {
          translateY.value = withTiming(0, SETTLE_TIMING);
          return;
        }

        isDismissing.value = true;
        translateY.value = withTiming(travelValue.value, DISMISS_TIMING, () => {
          "worklet";
          // Deliberately not gated on `finished`. An exit that is cut short is
          // still an exit the user asked for, and dropping it left the sheet
          // mounted with no way to close it. `isDismissing` is the real guard:
          // a new drag clears it in `onStart`, and clearing it here keeps a
          // second interruption from dismissing twice.
          if (!isDismissing.value) return;
          isDismissing.value = false;
          runOnJS(dismiss)();
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
  }, [
    dismiss,
    dismissible,
    dragOrigin,
    isDismissing,
    scrollContentHeight,
    scrollOffset,
    scrollRef,
    scrollViewport,
    scrollable,
    translateY,
    travelValue,
  ]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, Math.max(travelValue.value, 1)],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return {
    backdropStyle,
    gesture,
    onScrollContentSizeChange,
    onScrollViewLayout,
    scrollHandler,
    scrollRef,
    sheetStyle,
  };
}
