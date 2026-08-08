import { useId, type ReactNode } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  View,
  type TextInputProps,
} from "react-native";
import { Button } from "./Button";

/**
 * iOS renders these keyboard layouts without a return key, so a field using one
 * has no way to close the keyboard from the keyboard itself. Android always has
 * the system back button, which is why the accessory below is iOS-only.
 */
const KEYBOARDS_WITHOUT_RETURN_KEY = new Set<NonNullable<TextInputProps["keyboardType"]>>([
  "decimal-pad",
  "number-pad",
  "numbers-and-punctuation",
  "numeric",
  "phone-pad",
]);

/**
 * Gives a field a "Done" bar above the keyboard when its own return key can't
 * dismiss it: numeric keypads have no return key at all, and on a multiline
 * field return inserts a newline instead of submitting.
 *
 * Spread `inputAccessoryViewID` onto the `<TextInput>` and render
 * `keyboardDoneAccessory` alongside it; both are inert when the field's
 * keyboard already dismisses itself.
 *
 * Pass `always` for a full-screen form where the keyboard covers the submit
 * button, so every field advertises the same way out. One accessory can serve
 * several fields — share its `inputAccessoryViewID` across them and render
 * `keyboardDoneAccessory` once.
 */
export function useKeyboardDoneAccessory({
  keyboardType,
  multiline,
  always = false,
}: Pick<TextInputProps, "keyboardType" | "multiline"> & { always?: boolean } = {}): {
  inputAccessoryViewID: string | undefined;
  keyboardDoneAccessory: ReactNode;
} {
  // `useId()` embeds colons, which aren't safe in a native view identifier.
  const generatedId = useId().replace(/:/g, "");
  const nativeID = `keyboard-done-${generatedId}`;
  const isNeeded =
    Platform.OS === "ios" &&
    (always ||
      Boolean(multiline) ||
      (keyboardType != null && KEYBOARDS_WITHOUT_RETURN_KEY.has(keyboardType)));

  return {
    inputAccessoryViewID: isNeeded ? nativeID : undefined,
    keyboardDoneAccessory: isNeeded ? <KeyboardDoneAccessory nativeID={nativeID} /> : null,
  };
}

function KeyboardDoneAccessory({ nativeID }: { nativeID: string }) {
  return (
    // No bar of its own: the button floats over whatever sits between the
    // keyboard and the screen. The row still spans the keyboard's width, so
    // `alignItems` is what holds the button at content width on the right.
    <InputAccessoryView backgroundColor="transparent" nativeID={nativeID}>
      <View style={styles.row}>
        <Button compact label="Done" onPress={() => Keyboard.dismiss()} tone="secondary" />
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "flex-end",
    backgroundColor: "transparent",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
