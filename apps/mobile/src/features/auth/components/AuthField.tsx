import { forwardRef, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText } from "../../../shared/components/AppText";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";

/**
 * The app's auth text field: a bordered row that owns its own focus state, with
 * optional trailing content (a domain suffix, a visibility toggle).
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
        variant === "code" && styles.rowCode,
        focused && styles.rowFocused,
        hasError && styles.rowError,
      ]}
    >
      <TextInput
        ref={ref}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        placeholderTextColor={mobileColors.placeholderText}
        style={[styles.input, variant === "code" ? styles.inputCode : styles.inputFlex, style]}
        {...inputProps}
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

/** Inline validation message, paired with a field or a whole stage. */
export function AuthFieldError({ message }: { message: string }) {
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
    row: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 54,
      borderRadius: mobileRadii.control,
      borderWidth: 1.5,
      borderColor: mobileColors.inputBorder,
      backgroundColor: mobileColors.surface,
    },
    rowCode: {
      minHeight: 62,
    },
    rowFocused: {
      borderColor: mobileColors.inputBorderFocused,
    },
    rowError: {
      borderColor: mobileColors.inputBorderError,
    },
    input: {
      // No fontFamily: an explicit DM Sans family on TextInput breaks
      // Android EditText interactivity when the font hasn't loaded yet.
      // System font keeps the input safe; surrounding Text stays DM Sans.
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "400",
      color: mobileColors.textPrimary,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: 14,
    },
    inputFlex: {
      flex: 1,
    },
    inputCode: {
      flex: 1,
      textAlign: "center",
      fontSize: 26,
      letterSpacing: 10,
      fontWeight: "600",
    },
    suffix: {
      alignSelf: "stretch",
      justifyContent: "center",
      paddingHorizontal: 14,
      borderLeftWidth: 1,
      borderLeftColor: mobileColors.borderSubtle,
    },
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
