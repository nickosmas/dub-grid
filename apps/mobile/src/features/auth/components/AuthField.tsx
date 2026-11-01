import { forwardRef, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { AppText } from "../../../shared/components/AppText";
import { IS_ANDROID_LIST, IS_IOS_LIST } from "../../../shared/lib/native-list";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileControl,
  mobileInputText,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";

/**
 * The app's auth text field: a row that owns its own focus state, with
 * optional trailing content (a domain suffix, a visibility toggle). iOS draws
 * it as a grouped text field (a filled rounded row with no border) and
 * Android as Material 3's outlined field; the web build and the tests keep the
 * bordered row.
 *
 * Extracted from sign-in so forgot-password and reset-password get exactly the
 * same field rather than a near-copy that drifts.
 */
export const AuthField = forwardRef<
  TextInput,
  TextInputProps & {
    hasError?: boolean;
    /** Rendered inside the field's trailing edge, e.g. ".dubgrid.com". */
    suffix?: string;
    /** Rendered inside the trailing edge, e.g. the password visibility toggle. */
    trailingAccessory?: ReactNode;
    /** Centred, wide-tracked input for one-time codes. */
    variant?: "text" | "code";
  }
>(function AuthField(
  {
    hasError = false,
    suffix,
    trailingAccessory,
    variant = "text",
    onBlur,
    onFocus,
    style,
    ...inputProps
  },
  ref,
) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.row,
        IS_IOS_LIST && styles.rowIos,
        IS_ANDROID_LIST && styles.rowAndroid,
        variant === "code" && styles.rowCode,
        focused && !IS_IOS_LIST && (IS_ANDROID_LIST ? styles.rowFocusedAndroid : styles.rowFocused),
        hasError && (IS_ANDROID_LIST ? styles.rowErrorAndroid : styles.rowError),
      ]}
    >
      <TextInput
        ref={ref}
        {...inputProps}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        placeholderTextColor={mobileColors.textSubtle}
        selectionColor={mobileColors.brand}
        style={[styles.input, variant === "code" ? styles.inputCode : styles.inputFlex, style]}
      />
      {suffix ? (
        <View style={styles.suffix}>
          <AppText tone="muted" variant="bodyStrong">
            {suffix}
          </AppText>
        </View>
      ) : null}
      {trailingAccessory}
    </View>
  );
});

/**
 * Inline validation message, paired with a field or a whole stage.
 *
 * Kept as a named re-export so auth screens can go on importing it from beside
 * the field it annotates; the component itself is shared.
 */
export { InlineError as AuthFieldError } from "../../../shared/components/InlineError";

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: mobileControl.lg,
      borderRadius: mobileRadii.control,
      borderWidth: 1.5,
      borderColor: mobileColors.inputBorder,
      backgroundColor: mobileColors.surface,
    },
    rowIos: {
      borderWidth: 0,
    },
    // Material 3's outlined field: a 1dp outline at rest, 2dp in the primary
    // colour when focused, on a 4dp corner.
    rowAndroid: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: mobileColors.border,
      backgroundColor: "transparent",
    },
    rowFocusedAndroid: {
      borderWidth: 2,
      borderColor: mobileColors.brand,
    },
    rowErrorAndroid: {
      borderWidth: 2,
      borderColor: mobileColors.inputBorderError,
    },
    rowCode: {
      // The code's 32pt line plus its padding already clears the floor; this
      // only keeps an empty field on the same scale as the text variant.
      minHeight: mobileControl.lg,
    },
    rowFocused: {
      borderColor: mobileColors.inputBorderFocused,
    },
    rowError: {
      borderWidth: 1.5,
      borderColor: mobileColors.inputBorderError,
    },
    input: {
      ...mobileInputText("regular"),
      fontSize: mobileText.input.fontSize,
      lineHeight: mobileText.input.lineHeight,
      color: mobileColors.textPrimary,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.md,
    },
    inputFlex: {
      flex: 1,
      // Explicit, because iOS keeps a native field's tracking when the prop is
      // removed: a stage that reused the code field's input read "E m a i l".
      letterSpacing: 0,
    },
    inputCode: {
      ...mobileInputText("semibold"),
      flex: 1,
      textAlign: "center",
      fontSize: mobileText.display.fontSize,
      lineHeight: mobileText.display.lineHeight,
      letterSpacing: 10,
    },
    suffix: {
      alignSelf: "stretch",
      justifyContent: "center",
      paddingHorizontal: mobileSpace.md,
      borderLeftWidth: 1,
      borderLeftColor: mobileColors.borderSubtle,
    },
  });
