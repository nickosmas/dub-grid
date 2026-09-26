import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "../../../shared/components/AppText";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileRadii, mobileSpace, type MobileColors } from "../../../shared/theme/tokens";
import {
  PASSWORD_STRENGTH_LABELS,
  getPasswordStrengthHints,
  getPasswordStrengthLevel,
} from "@dubgrid/domain";

export function PasswordStrengthHints({ password }: { password: string }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const hints = getPasswordStrengthHints(password);
  const level = getPasswordStrengthLevel(password);
  const hasStartedTyping = password.length > 0;

  const levelTone = level === 3 ? "success" : level === 0 ? "danger" : "warning";

  return (
    <View accessibilityLabel="Password strength hints" style={styles.root}>
      <View style={styles.header}>
        <AppText tone="muted" variant="label">
          Password strength
        </AppText>
        {hasStartedTyping ? (
          <AppText tone={levelTone} variant="label">
            {PASSWORD_STRENGTH_LABELS[level]}
          </AppText>
        ) : null}
      </View>
      <View style={styles.hintList}>
        {hints.map((hint) => (
          <View key={hint.id} style={styles.hintRow}>
            <View style={[styles.dot, hint.met && styles.dotMet]} />
            <AppText
              style={styles.hintText}
              tone={hint.met ? "secondary" : "subtle"}
              variant="caption"
            >
              {hint.label}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    root: {
      gap: mobileSpace.sm,
      backgroundColor: mobileColors.surfaceSecondary,
      borderRadius: mobileRadii.control,
      padding: mobileSpace.md,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: mobileSpace.sm,
    },
    hintList: {
      gap: mobileSpace.xs,
    },
    hintRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
    },
    // A long hint wraps within the card instead of sizing to the full row.
    hintText: {
      flexShrink: 1,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.border,
    },
    dotMet: {
      backgroundColor: mobileColors.success,
    },
  });
