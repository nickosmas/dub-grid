import { useEffect, useState } from "react";
import { Keyboard, Platform, type KeyboardEventName } from "react-native";

/**
 * Height of the on-screen keyboard, or 0 whenever it is closed.
 *
 * This exists because `KeyboardAvoidingView` cannot be used inside the sheet
 * modal. On Android React Native routes `keyboardDidHide` through the same
 * handler as a frame change, and that event reports `screenY` as the *height*
 * of the visible display frame rather than as its bottom edge. Inside a
 * full-screen modal those two differ by the system bars, so the view is left
 * holding a bottom inset the size of the navigation bar after the keyboard is
 * already gone — and since the sheet and its backdrop both live inside that
 * box, both lift off the bottom of the screen and the undimmed app shows
 * through the strip underneath. Here a hide is unconditionally zero, so the
 * inset only ever exists while the keyboard does.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    // iOS's `will` events lead the keyboard's own animation, so the sheet
    // travels with it rather than after it. Android only emits `did`.
    const showEvent: KeyboardEventName =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent: KeyboardEventName =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const subscriptions = [
      Keyboard.addListener(showEvent, (event) => setInset(event.endCoordinates.height)),
      Keyboard.addListener(hideEvent, () => setInset(0)),
    ];

    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  return inset;
}
