import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText } from "./AppText";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileSpace, mobileText, type MobileColors } from "../theme/tokens";

/**
 * The app's inline error row: a message that belongs to the surface it appears
 * on, rather than to the app as a whole.
 *
 * Use this over a toast anywhere the failure happened inside a `<Modal>` — a
 * sheet or a confirmation. A `<Modal>` is its own native window, so a toast
 * pushed from inside one renders in the root window *behind* it and the user
 * sees nothing at all. Toasts stay the right answer for a failure on a plain
 * screen, and for anything that happens after the surface has already closed.
 *
 * Started life as `AuthFieldError` and was independently re-declared, byte for
 * byte, in sign-in and the password screen. One component now.
 */
export function InlineError({ message }: { message: string }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View style={styles.errorRow}>
      <Ionicons color={mobileColors.dangerText} name="alert-circle" size={16} />
      <AppText style={styles.errorText} tone="danger" variant="meta">
        {message}
      </AppText>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    errorRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: mobileSpace.sm,
      paddingHorizontal: mobileSpace.xs,
    },
    errorText: {
      flex: 1,
      lineHeight: mobileText.meta.lineHeight,
    },
  });
