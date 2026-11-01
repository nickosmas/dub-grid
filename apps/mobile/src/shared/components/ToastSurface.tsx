import Ionicons from "@expo/vector-icons/Ionicons";
import { toastToneTokens } from "@dubgrid/design-tokens";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileColors } from "../providers/ThemeModeProvider";
import {
  mobileOnAccent,
  mobileRadii,
  mobileSpace,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../theme/tokens";
import { Text } from "./Text";
import { useToastSwipe } from "./toast-swipe";
import type { ToastSurfaceProps, ToastSurfaceTone } from "./ToastSurface.types";

export type { ToastSurfaceProps } from "./ToastSurface.types";

const TOAST_HOST_GUTTER = 20;

const TONE_ICON: Record<ToastSurfaceTone, keyof typeof Ionicons.glyphMap> = {
  error: "alert-circle",
  success: "checkmark-circle",
  info: "information-circle",
  warning: "warning",
};

/**
 * A toast as the web build and the tests draw it: a solid tone card at the
 * top. The phones draw their own: a Liquid Glass capsule on iOS (`.ios.tsx`)
 * and a Material 3 snackbar on Android (`.android.tsx`).
 */
export function ToastSurface({ testID, tone, title, message, onDismiss }: ToastSurfaceProps) {
  const mobileColors = useMobileColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(mobileColors, insets.left, insets.right),
    [mobileColors, insets.left, insets.right],
  );
  const swipe = useToastSwipe(onDismiss, "top");
  const palette = toastToneTokens[tone];

  return (
    <View pointerEvents="box-none" style={styles.host}>
      <View
        testID={testID}
        {...swipe}
        style={[
          styles.toast,
          {
            marginTop: insets.top + 12,
            backgroundColor: palette.background,
            borderColor: palette.border,
          },
        ]}
      >
        <Ionicons color={mobileColors.textInverse} name={TONE_ICON[tone]} size={20} />
        <View style={styles.copy}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, insetLeft: number, insetRight: number) =>
  StyleSheet.create({
    host: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      alignItems: "center",
      // The side insets matter in landscape on a notched device, where a fixed
      // gutter runs the toast under the sensor housing.
      paddingLeft: TOAST_HOST_GUTTER + insetLeft,
      paddingRight: TOAST_HOST_GUTTER + insetRight,
      zIndex: 100,
      elevation: 100,
    },
    toast: {
      width: "100%",
      maxWidth: 520,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      paddingVertical: mobileSpace.md,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    copy: {
      flex: 1,
      gap: mobileSpace.xs,
    },
    title: {
      ...mobileText.bodyStrong,
      color: mobileColors.textInverse,
    },
    message: {
      ...mobileTextWeighted("meta", "medium"),
      color: mobileOnAccent.secondary,
    },
  });
