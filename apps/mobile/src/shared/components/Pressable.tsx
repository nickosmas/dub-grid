import {
  Pressable as RNPressable,
  type GestureResponderEvent,
  type PressableProps,
} from "react-native";

import { useAsyncAction } from "../hooks/useAsyncAction";

/**
 * `Pressable` with the double-press latch already on it.
 *
 * `<Button>`, `<PressableRow>` and `<ConfirmationModal>` latch their own
 * handler, but a screen that reaches for a bare `Pressable` -- a link-style
 * row, a header action, a card -- gets no such protection, and a handler that
 * fires a request can run twice on a fast double-tap. A screen-level `busy`
 * flag does not stop it: like `disabled` on the web, it only takes effect
 * after a re-render, and the second tap lands before that.
 *
 * Swapping the import is deliberately the whole change: every `<Pressable>` in
 * a file is covered at once, with no call site edited and no behaviour altered
 * for the synchronous ones, since the latch returns early when the handler
 * hands back anything that is not a promise.
 *
 * Not for `Animated.createAnimatedComponent`, which needs React Native's own
 * component; latch the `onPress` those receive instead.
 */
export function Pressable({
  onPress,
  ...rest
}: Omit<PressableProps, "onPress"> & {
  onPress?: (event: GestureResponderEvent) => unknown;
}) {
  const action = useAsyncAction(onPress ?? (() => {}));

  return <RNPressable {...rest} onPress={action.run} />;
}
